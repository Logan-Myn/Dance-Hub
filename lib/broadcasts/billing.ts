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

/**
 * Create a Stripe Subscription in incomplete state so the frontend can
 * confirm payment via PaymentElement (in-app, no redirect). Returns the
 * client_secret for stripe.confirmPayment().
 *
 * Note: Stripe API 2025-12-15.clover removed invoice.payment_intent.
 * We retrieve the auto-created PaymentIntent via paymentIntents.list()
 * on the customer instead.
 */
export async function createBroadcastSubscriptionIntent(
  input: CreateSubscriptionIntentInput
): Promise<CreateSubscriptionIntentResult> {
  const priceId = process.env[BROADCAST_PRICE_ID_ENV];
  if (!priceId) throw new Error(`Missing ${BROADCAST_PRICE_ID_ENV}`);

  // Reuse existing Stripe customer if available, otherwise create one
  let customerId: string;
  const existing = await queryOne<{ stripe_customer_id: string }>`
    SELECT stripe_customer_id
    FROM community_broadcast_subscriptions
    WHERE community_id = ${input.communityId}
  `;

  if (existing?.stripe_customer_id) {
    customerId = existing.stripe_customer_id;
  } else {
    const customer = await stripe.customers.create({
      email: input.ownerEmail,
      metadata: {
        communityId: input.communityId,
        purpose: 'broadcast_subscription',
      },
    });
    customerId = customer.id;
  }

  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    metadata: {
      communityId: input.communityId,
      purpose: 'broadcast_subscription',
    },
  });

  // Stripe API 2025-12-15.clover removed invoice.payment_intent.
  // The PaymentIntent is still auto-created — retrieve it via the customer.
  const paymentIntents = await stripe.paymentIntents.list({
    customer: customerId,
    limit: 1,
  });
  const paymentIntent = paymentIntents.data[0];

  if (!paymentIntent?.client_secret) {
    throw new Error('Stripe did not return a client_secret');
  }

  // Create the DB row immediately (status=incomplete). The webhook handler
  // will update it to 'active' when payment confirms.
  await upsertBroadcastSubscription({
    communityId: input.communityId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    status: 'incomplete',
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null,
  });

  return {
    clientSecret: paymentIntent.client_secret,
    subscriptionId: subscription.id,
  };
}

export interface UpsertSubscriptionInput {
  communityId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: 'active' | 'past_due' | 'canceled' | 'incomplete';
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
