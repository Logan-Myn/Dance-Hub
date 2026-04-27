import type { ActivityEvent } from './types';
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';

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

export async function getRecentFailedPayments(
  stripeAccountId: string | null,
  now: Date = new Date()
): Promise<ActivityEvent[]> {
  if (!stripeAccountId) return [];
  try {
    const account = await stripe.accounts.retrieve(stripeAccountId);
    if (!account.charges_enabled) return [];
  } catch {
    return [];
  }

  const sinceSec = Math.floor(now.getTime() / 1000) - THIRTY_DAYS_SECONDS;
  // Stripe has no server-side status filter; over-fetch and filter client-side
  // so a recent burst of succeeded charges doesn't hide older failures.
  const charges = await stripe.charges.list(
    { created: { gte: sinceSec }, limit: 100 },
    { stripeAccount: stripeAccountId }
  );

  return charges.data
    .filter((c: Stripe.Charge) => c.status === 'failed')
    .map((c: Stripe.Charge) => ({
      type: 'failed_payment' as const,
      at: new Date(c.created * 1000),
      userId: (c.metadata?.user_id as string | undefined) ?? null,
      displayName: c.billing_details?.name ?? 'Unknown',
      amount: c.amount / 100,
    }));
}
