import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { sql, queryOne } from '@/lib/db';
import { BROADCAST_PRICE_ID_ENV } from './constants';

export interface CreateSubscriptionIntentInput {
  communityId: string;
  ownerEmail: string;
}

export interface CreateSubscriptionIntentResult {
  clientSecret: string;
  subscriptionId: string;
}

/** A refusal the route passes on as-is (message and HTTP status). */
export class BroadcastSubscriptionError extends Error {
  constructor(message: string, public readonly httpStatus: number) {
    super(message);
    this.name = 'BroadcastSubscriptionError';
  }
}

export type BroadcastSubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'incomplete';

/**
 * Maps a Stripe subscription status onto the table's CHECK set. Writing
 * Stripe's own value (incomplete_expired, unpaid, trialing, ...) failed the
 * CHECK, so the webhook answered 500 and Stripe retried for days.
 */
export function toBroadcastStatus(status: string): BroadcastSubscriptionStatus {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'incomplete':
      return 'incomplete';
    case 'past_due':
    case 'unpaid':
    case 'paused':
      return 'past_due';
    default:
      // canceled, incomplete_expired
      return 'canceled';
  }
}

/** API 2025-12-15.clover moved current_period_end onto the subscription items. */
export function subscriptionPeriodEnd(sub: Stripe.Subscription): Date | null {
  const end =
    (sub.items?.data?.[0] as { current_period_end?: number } | undefined)?.current_period_end ??
    (sub as { current_period_end?: number }).current_period_end;
  return end ? new Date(end * 1000) : null;
}

/**
 * The client secret of the subscription's own latest invoice, when that
 * invoice can still be paid. (Clover removed invoice.payment_intent; the
 * invoice's confirmation_secret replaces it. The customer's newest
 * PaymentIntent, used before, could belong to another subscription.)
 */
function payableClientSecret(sub: Stripe.Subscription): string | null {
  const invoice = sub.latest_invoice as
    | (Stripe.Invoice & { confirmation_secret?: { client_secret?: string } | null })
    | string
    | null;
  if (!invoice || typeof invoice === 'string' || invoice.status !== 'open') return null;
  return invoice.confirmation_secret?.client_secret ?? null;
}

async function retrieveSubscription(id: string): Promise<Stripe.Subscription | null> {
  try {
    return await stripe.subscriptions.retrieve(id, { expand: ['latest_invoice.confirmation_secret'] });
  } catch (error) {
    if ((error as { code?: string }).code === 'resource_missing') return null;
    throw error;
  }
}

/**
 * Returns a client secret for paying the community's broadcast subscription
 * in-app (PaymentElement + stripe.confirmPayment, no redirect).
 *
 * The community has one subscription row. An incomplete or past_due
 * subscription with an open invoice is reused, so reopening the dialog
 * doesn't start another €10/month subscription; an active one is refused; one
 * that can't be paid any more is cancelled before a new one is created.
 */
export async function createBroadcastSubscriptionIntent(
  input: CreateSubscriptionIntentInput
): Promise<CreateSubscriptionIntentResult> {
  const priceId = process.env[BROADCAST_PRICE_ID_ENV];
  if (!priceId) throw new Error(`Missing ${BROADCAST_PRICE_ID_ENV}`);

  const existing = await queryOne<{
    stripe_customer_id: string;
    stripe_subscription_id: string | null;
    status: string;
  }>`
    SELECT stripe_customer_id, stripe_subscription_id, status
    FROM community_broadcast_subscriptions
    WHERE community_id = ${input.communityId}
  `;

  if (existing?.stripe_subscription_id) {
    const current = await retrieveSubscription(existing.stripe_subscription_id);
    if (current) {
      if (current.status === 'active' || current.status === 'trialing') {
        throw new BroadcastSubscriptionError('This community already has unlimited broadcasts', 409);
      }
      if (current.status === 'incomplete' || current.status === 'past_due') {
        const clientSecret = payableClientSecret(current);
        if (clientSecret) {
          await upsertBroadcastSubscription({
            communityId: input.communityId,
            stripeCustomerId: current.customer as string,
            stripeSubscriptionId: current.id,
            status: toBroadcastStatus(current.status),
            currentPeriodEnd: subscriptionPeriodEnd(current),
          });
          return { clientSecret, subscriptionId: current.id };
        }
      }
      if (current.status !== 'canceled' && current.status !== 'incomplete_expired') {
        // unpaid, paused, or nothing left to pay: end it so it can't bill
        // next to the new one.
        await stripe.subscriptions.cancel(current.id);
      }
    }
  }

  // Reuse existing Stripe customer if available, otherwise create one
  let customerId: string;
  if (existing?.stripe_customer_id) {
    customerId = existing.stripe_customer_id;
  } else {
    const customer = await stripe.customers.create(
      {
        email: input.ownerEmail,
        metadata: {
          communityId: input.communityId,
          purpose: 'broadcast_subscription',
        },
      },
      { idempotencyKey: `broadcast-customer-${input.communityId}` }
    );
    customerId = customer.id;
  }

  // Keyed on the subscription it replaces: two dialogs opened at once get the
  // same subscription back instead of two.
  const subscription = await stripe.subscriptions.create(
    {
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.confirmation_secret'],
      metadata: {
        communityId: input.communityId,
        purpose: 'broadcast_subscription',
      },
    },
    {
      idempotencyKey: `broadcast-subscription-${input.communityId}-${existing?.stripe_subscription_id ?? 'first'}`,
    }
  );

  const clientSecret = payableClientSecret(subscription);
  if (!clientSecret) {
    throw new Error('Stripe did not return a client_secret');
  }

  // Create the DB row immediately (status=incomplete). The webhook handler
  // will update it to 'active' when payment confirms.
  await upsertBroadcastSubscription({
    communityId: input.communityId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    status: toBroadcastStatus(subscription.status),
    currentPeriodEnd: subscriptionPeriodEnd(subscription),
  });

  return { clientSecret, subscriptionId: subscription.id };
}

/**
 * Records a broadcast subscription's state from a webhook event. The row
 * holds one subscription per community. Events for any other subscription of
 * the community (an abandoned attempt, a replaced one) are ignored unless it
 * is becoming active, so dunning cancelling an old subscription can't drop a
 * paying community back to the free tier.
 */
export async function recordBroadcastSubscription(
  communityId: string | undefined,
  sub: Stripe.Subscription
): Promise<'recorded' | 'ignored'> {
  const status = toBroadcastStatus(sub.status);
  const currentPeriodEnd = subscriptionPeriodEnd(sub);

  if (!communityId) {
    await markBroadcastSubscriptionStatus(sub.id, status, currentPeriodEnd);
    return 'recorded';
  }

  const row = await queryOne<{ stripe_subscription_id: string }>`
    SELECT stripe_subscription_id
    FROM community_broadcast_subscriptions
    WHERE community_id = ${communityId}
  `;
  if (row && row.stripe_subscription_id !== sub.id && status !== 'active') {
    return 'ignored';
  }

  await upsertBroadcastSubscription({
    communityId,
    stripeCustomerId: sub.customer as string,
    stripeSubscriptionId: sub.id,
    status,
    currentPeriodEnd,
  });
  return 'recorded';
}

export interface UpsertSubscriptionInput {
  communityId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: BroadcastSubscriptionStatus;
  currentPeriodEnd: Date | null;
}

export async function upsertBroadcastSubscription(input: UpsertSubscriptionInput): Promise<void> {
  await sql`
    INSERT INTO community_broadcast_subscriptions
      (community_id, stripe_customer_id, stripe_subscription_id, status, current_period_end)
    VALUES
      (${input.communityId}, ${input.stripeCustomerId}, ${input.stripeSubscriptionId},
       ${input.status}, ${input.currentPeriodEnd})
    ON CONFLICT (community_id) DO UPDATE SET
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      status = EXCLUDED.status,
      current_period_end = EXCLUDED.current_period_end,
      updated_at = now()
  `;
}

export async function markBroadcastSubscriptionStatus(
  stripeSubscriptionId: string,
  status: UpsertSubscriptionInput['status'],
  currentPeriodEnd: Date | null
): Promise<void> {
  await sql`
    UPDATE community_broadcast_subscriptions
    SET status = ${status},
        current_period_end = ${currentPeriodEnd},
        updated_at = now()
    WHERE stripe_subscription_id = ${stripeSubscriptionId}
  `;
}
