import { cache } from 'react';
import { stripe } from '@/lib/stripe';
import { query } from '@/lib/db';
import type Stripe from 'stripe';
import {
  getCalendarMonthRange,
  computeMoMGrowth,
} from '@/lib/admin-dashboard/stats';
import type { PlatformRevenuePoint } from './types';

type CommunityRow = { stripe_account_id: string | null };

export async function getAllConnectedAccountIds(): Promise<string[]> {
  const rows = await query<CommunityRow>`
    SELECT stripe_account_id
    FROM communities
    WHERE stripe_account_id IS NOT NULL
  `;
  return rows.map((r) => r.stripe_account_id!).filter(Boolean);
}

// Memoized via React's request-scoped cache so a single render that touches
// many helpers (sumSucceededOnAccount, getActiveSubscriptionsStats,
// activity-feed's failed-payments fetch, etc.) only retrieves each account
// once. Returns false on any error so callers can short-circuit safely.
export const isAccountChargesEnabled = cache(
  async (stripeAccountId: string): Promise<boolean> => {
    try {
      const account = await stripe.accounts.retrieve(stripeAccountId);
      return Boolean(account.charges_enabled);
    } catch {
      return false;
    }
  }
);

async function sumPlatformFees(start: Date, end: Date): Promise<number> {
  const fees = await stripe.applicationFees
    .list({
      created: {
        gte: Math.floor(start.getTime() / 1000),
        lt: Math.floor(end.getTime() / 1000),
      },
      limit: 100,
    })
    .autoPagingToArray({ limit: 1000 });
  return fees.reduce((sum, f) => sum + f.amount / 100, 0);
}

async function sumSucceededOnAccount(
  stripeAccountId: string,
  start: Date,
  end: Date
): Promise<number> {
  if (!(await isAccountChargesEnabled(stripeAccountId))) return 0;

  const charges = await stripe.charges
    .list(
      {
        created: {
          gte: Math.floor(start.getTime() / 1000),
          lt: Math.floor(end.getTime() / 1000),
        },
        limit: 100,
      },
      { stripeAccount: stripeAccountId }
    )
    .autoPagingToArray({ limit: 1000 });
  return charges.reduce(
    (total, c: Stripe.Charge) =>
      c.status === 'succeeded' ? total + c.amount / 100 : total,
    0
  );
}

async function sumCommunitiesRevenue(
  accountIds: string[],
  start: Date,
  end: Date
): Promise<number> {
  if (accountIds.length === 0) return 0;
  const perAccount = await Promise.all(
    accountIds.map((id) => sumSucceededOnAccount(id, start, end))
  );
  return perAccount.reduce((sum, v) => sum + v, 0);
}

export async function getMonthlyRevenueStats(now: Date = new Date()) {
  const accountIds = await getAllConnectedAccountIds();
  const thisMonth = getCalendarMonthRange(now, 0);
  const lastMonth = getCalendarMonthRange(now, -1);

  const [platformThis, platformLast, commThis, commLast] = await Promise.all([
    sumPlatformFees(thisMonth.start, thisMonth.end),
    sumPlatformFees(lastMonth.start, lastMonth.end),
    sumCommunitiesRevenue(accountIds, thisMonth.start, thisMonth.end),
    sumCommunitiesRevenue(accountIds, lastMonth.start, lastMonth.end),
  ]);

  return {
    platformRevenueThisMonth: platformThis,
    platformRevenueGrowth: computeMoMGrowth(platformThis, platformLast),
    communitiesRevenueThisMonth: commThis,
    communitiesRevenueGrowth: computeMoMGrowth(commThis, commLast),
  };
}

export async function getRevenueChart6Months(
  now: Date = new Date()
): Promise<PlatformRevenuePoint[]> {
  const accountIds = await getAllConnectedAccountIds();
  const months = Array.from({ length: 6 }, (_, i) => getCalendarMonthRange(now, i - 5));

  const results = await Promise.all(
    months.map(async ({ start, end }) => {
      const [platform, community] = await Promise.all([
        sumPlatformFees(start, end),
        sumCommunitiesRevenue(accountIds, start, end),
      ]);
      return { platform, community };
    })
  );

  return months.map(({ start }, i) => ({
    month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
    total: results[i].community,
    platformFees: results[i].platform,
  }));
}

// MoM growth compares created-minus-cancelled in this month vs. last month —
// Stripe has no point-in-time count, so this is a heuristic, not exact.
export async function getActiveSubscriptionsStats(
  now: Date = new Date()
): Promise<{ count: number; growth: number }> {
  const accountIds = await getAllConnectedAccountIds();

  const platformSubs = await stripe.subscriptions
    .list({ status: 'active', limit: 100 })
    .autoPagingToArray({ limit: 1000 });

  const connectedCounts = await Promise.all(
    accountIds.map(async (id) => {
      if (!(await isAccountChargesEnabled(id))) return 0;
      const subs = await stripe.subscriptions
        .list({ status: 'active', limit: 100 }, { stripeAccount: id })
        .autoPagingToArray({ limit: 1000 });
      return subs.length;
    })
  );

  const total = platformSubs.length + connectedCounts.reduce((a, b) => a + b, 0);

  const thisMonth = getCalendarMonthRange(now, 0);
  const lastMonth = getCalendarMonthRange(now, -1);
  const [thisDelta, lastDelta] = await Promise.all([
    deltaInWindow(accountIds, thisMonth.start, thisMonth.end),
    deltaInWindow(accountIds, lastMonth.start, lastMonth.end),
  ]);

  return {
    count: total,
    growth: computeMoMGrowth(thisDelta, lastDelta),
  };
}

async function deltaInWindow(
  accountIds: string[],
  start: Date,
  end: Date
): Promise<number> {
  const sinceSec = Math.floor(start.getTime() / 1000);
  const untilSec = Math.floor(end.getTime() / 1000);

  const platformDelta = stripe.subscriptions
    .list({ created: { gte: sinceSec, lt: untilSec }, limit: 100 })
    .autoPagingToArray({ limit: 1000 })
    .then((subs) => subs.length - countCancelledInWindow(subs, sinceSec, untilSec));

  const connectedDeltas = accountIds.map(async (id) => {
    if (!(await isAccountChargesEnabled(id))) return 0;
    const subs = await stripe.subscriptions
      .list(
        { created: { gte: sinceSec, lt: untilSec }, limit: 100 },
        { stripeAccount: id }
      )
      .autoPagingToArray({ limit: 1000 });
    return subs.length - countCancelledInWindow(subs, sinceSec, untilSec);
  });

  const all = await Promise.all([platformDelta, ...connectedDeltas]);
  return all.reduce((sum, v) => sum + v, 0);
}

function countCancelledInWindow(
  subs: Stripe.Subscription[],
  sinceSec: number,
  untilSec: number
): number {
  return subs.filter(
    (s) => s.canceled_at && s.canceled_at >= sinceSec && s.canceled_at < untilSec
  ).length;
}
