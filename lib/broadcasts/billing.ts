import { stripe } from '@/lib/stripe';
import { sql } from '@/lib/db';
import { BROADCAST_PRICE_ID_ENV } from './constants';

export interface CreateCheckoutSessionInput {
  communityId: string;
  communitySlug: string;
  ownerEmail: string;
  returnUrl: string;
}

export interface CreateCheckoutSessionResult {
  checkoutUrl: string;
  sessionId: string;
}

export async function createBroadcastCheckoutSession(
  input: CreateCheckoutSessionInput
): Promise<CreateCheckoutSessionResult> {
  const priceId = process.env[BROADCAST_PRICE_ID_ENV];
  if (!priceId) throw new Error(`Missing ${BROADCAST_PRICE_ID_ENV}`);

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://dance-hub.io';
  const successUrl = `${baseUrl}/${input.communitySlug}/admin/emails?subscription=success`;
  const cancelUrl = `${baseUrl}/${input.communitySlug}/admin/emails?subscription=cancelled`;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: input.ownerEmail,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      communityId: input.communityId,
      purpose: 'broadcast_subscription',
    },
    subscription_data: {
      metadata: {
        communityId: input.communityId,
        purpose: 'broadcast_subscription',
      },
    },
  });

  if (!session.url) throw new Error('Stripe did not return a checkout URL');
  return { checkoutUrl: session.url, sessionId: session.id };
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
