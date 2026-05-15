import type { ActivityEvent } from './types';
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';
import { unstable_cache } from 'next/cache';
import { getAccountOnce } from './stats';

/**
 * Concatenate event lists, sort newest-first by `at`, slice to `limit`.
 * Stable: equal timestamps keep their relative input order.
 */
export function mergeActivityEvents(
  lists: ActivityEvent[][],
  limit: number
): ActivityEvent[] {
  const flat: { event: ActivityEvent; idx: number }[] = [];
  let counter = 0;
  for (const list of lists) {
    for (const event of list) {
      flat.push({ event, idx: counter++ });
    }
  }
  flat.sort((a, b) => {
    const diff = b.event.at.getTime() - a.event.at.getTime();
    return diff !== 0 ? diff : a.idx - b.idx;
  });
  return flat.slice(0, limit).map((x) => x.event);
}

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

// Failed payments are low-churn on the dashboard. Cache the listing for 5 min
// per account so admins clicking between admin tabs don't re-fetch every time.
function getCachedFailedPayments(stripeAccountId: string, sinceSec: number) {
  return unstable_cache(
    async (): Promise<ActivityEvent[]> => {
      const charges = await stripe.charges
        .list(
          { created: { gte: sinceSec }, limit: 100 },
          { stripeAccount: stripeAccountId }
        )
        .autoPagingToArray({ limit: 1000 });
      return charges
        .filter((c: Stripe.Charge) => c.status === 'failed')
        .slice(0, 10)
        .map((c: Stripe.Charge) => ({
          type: 'failed_payment' as const,
          at: new Date(c.created * 1000),
          userId: (c.metadata?.user_id as string | undefined) ?? null,
          displayName: c.billing_details?.name ?? 'Unknown',
          amount: c.amount / 100,
        }));
    },
    ['admin-dashboard-failed-payments', stripeAccountId, String(sinceSec)],
    { revalidate: 300, tags: [`failed-payments:${stripeAccountId}`] }
  )();
}

export async function getRecentFailedPayments(
  stripeAccountId: string | null,
  now: Date = new Date()
): Promise<ActivityEvent[]> {
  if (!stripeAccountId) return [];
  const account = await getAccountOnce(stripeAccountId);
  if (!account?.charges_enabled) return [];

  // Round the cache key to the hour so we get hourly buckets instead of a new
  // cache entry every second (which would defeat caching entirely).
  const sinceSec = Math.floor(now.getTime() / 1000) - THIRTY_DAYS_SECONDS;
  const sinceBucket = Math.floor(sinceSec / 3600) * 3600;
  return getCachedFailedPayments(stripeAccountId, sinceBucket);
}
