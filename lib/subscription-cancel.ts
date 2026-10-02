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

export interface MemberSubscriptionRef {
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  /** The community's connected account, where membership subscriptions live. */
  stripe_account_id: string | null;
}

// Stripe calls in flight at once when cancelling many subscriptions (a
// community delete), to stay well inside the API rate limit.
const CANCEL_CONCURRENCY = 5;

/**
 * Cancels the membership subscriptions of rows that are about to be deleted
 * (a removed member, a deleted community or user), up to 5 at a time. Free
 * members and subscriptions that already ended are skipped. Returns the ids
 * that could not be cancelled; the caller must not delete anything if there
 * are any.
 */
export async function cancelMemberSubscriptions(rows: MemberSubscriptionRef[]): Promise<string[]> {
  const failed: string[] = [];
  const toCancel = rows.filter(
    (row) =>
      row.stripe_subscription_id &&
      !(row.subscription_status && ENDED_SUBSCRIPTION_STATUSES.includes(row.subscription_status)),
  );

  let next = 0;
  const worker = async () => {
    while (next < toCancel.length) {
      const row = toCancel[next++];
      const subscriptionId = row.stripe_subscription_id!;
      if (!row.stripe_account_id) {
        // The subscription lives on a connected account we no longer know.
        console.error('[subscriptions] no connected account to cancel on:', subscriptionId);
        failed.push(subscriptionId);
        continue;
      }
      try {
        await cancelSubscriptionNow(subscriptionId, row.stripe_account_id);
      } catch (err) {
        console.error('[subscriptions] failed to cancel:', subscriptionId, err);
        failed.push(subscriptionId);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CANCEL_CONCURRENCY, toCancel.length) }, worker),
  );
  return failed;
}
