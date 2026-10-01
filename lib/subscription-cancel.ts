import { stripe } from '@/lib/stripe';
import { ENDED_SUBSCRIPTION_STATUSES } from '@/lib/membership-ended';

/** True for Stripe's "No such ..." errors (the object doesn't exist on that account). */
export function isMissingStripeResource(err: unknown): boolean {
  const e = err as { code?: string; statusCode?: number } | null;
  return e?.code === 'resource_missing' || e?.statusCode === 404;
}

/**
 * Cancels a subscription immediately, on the community's connected account
 * (or the platform account when stripeAccountId is null). Resolves when the
 * subscription is cancelled, had already ended, or no longer exists. Throws
 * otherwise, so the caller can stop before deleting the rows that link the
 * subscription to anyone.
 */
export async function cancelSubscriptionNow(
  subscriptionId: string,
  stripeAccountId: string | null,
): Promise<void> {
  const options = stripeAccountId ? { stripeAccount: stripeAccountId } : null;
  try {
    if (options) {
      await stripe.subscriptions.cancel(subscriptionId, options);
    } else {
      await stripe.subscriptions.cancel(subscriptionId);
    }
  } catch (err) {
    if (isMissingStripeResource(err)) return;
    // Cancelling one that already ended is an error too: check its status.
    try {
      const sub = options
        ? await stripe.subscriptions.retrieve(subscriptionId, options)
        : await stripe.subscriptions.retrieve(subscriptionId);
      if (ENDED_SUBSCRIPTION_STATUSES.includes(sub.status)) return;
    } catch (retrieveErr) {
      if (isMissingStripeResource(retrieveErr)) return;
    }
    throw err;
  }
}
