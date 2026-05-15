import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';
import type { RevenuePoint, GrowthPoint } from './types';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';

// Dedupes stripe.accounts.retrieve within a single request so the dashboard's
// three Stripe-bound helpers don't each ping the platform separately.
const getAccountOnce = cache(async (stripeAccountId: string) => {
  try {
    return await stripe.accounts.retrieve(stripeAccountId);
  } catch {
    return null;
  }
});

/**
 * Calendar month range. start is inclusive (1st of month at 00:00 local),
 * end is exclusive (1st of the *next* month). offsetMonths shifts both by N.
 */
export function getCalendarMonthRange(
  now: Date = new Date(),
  offsetMonths: number = 0
): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 1);
  return { start, end };
}

/**
 * Rounded percentage change. previous=0 with current>0 returns 100
 * (no baseline; treated as full growth). Both 0 returns 0.
 */
export function computeMoMGrowth(current: number, previous: number): number {
  if (previous > 0) {
    return Math.round(((current - previous) / previous) * 100);
  }
  if (current > 0) return 100;
  return 0;
}

async function sumSucceeded(
  stripeAccountId: string,
  start: Date,
  end: Date
): Promise<number> {
  // autoPagingToArray walks all pages so a single month with >100 charges
  // doesn't get silently truncated. limit cap at 1000 is a safety bound.
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
    (total: number, c: Stripe.Charge) =>
      c.status === 'succeeded' ? total + c.amount / 100 : total,
    0
  );
}

// Historical (closed) months are immutable for our 'sum of succeeded charges'
// calculation: refunds/disputes don't flip charge.status away from succeeded.
// Cache for 24h per account+month so navigations within that window skip Stripe.
function getHistoricalMonthRevenue(
  stripeAccountId: string,
  year: number,
  month: number
): Promise<number> {
  const key = `${year}-${String(month + 1).padStart(2, '0')}`;
  return unstable_cache(
    async () => {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 1);
      return sumSucceeded(stripeAccountId, start, end);
    },
    ['admin-dashboard-historical-month-revenue', stripeAccountId, key],
    { revalidate: 86400, tags: [`revenue:${stripeAccountId}`] }
  )();
}

function isCurrentMonth(start: Date, now: Date): boolean {
  return start.getFullYear() === now.getFullYear() && start.getMonth() === now.getMonth();
}

function formatYearMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function getRevenueForMonth(
  stripeAccountId: string,
  monthStart: Date,
  monthEnd: Date,
  now: Date
): Promise<number> {
  return isCurrentMonth(monthStart, now)
    ? sumSucceeded(stripeAccountId, monthStart, monthEnd)
    : getHistoricalMonthRevenue(stripeAccountId, monthStart.getFullYear(), monthStart.getMonth());
}

export async function getMonthlyRevenue(
  stripeAccountId: string | null,
  now: Date = new Date()
): Promise<{ monthlyRevenue: number; revenueGrowth: number }> {
  if (!stripeAccountId) return { monthlyRevenue: 0, revenueGrowth: 0 };

  const account = await getAccountOnce(stripeAccountId);
  if (!account?.charges_enabled) return { monthlyRevenue: 0, revenueGrowth: 0 };

  const thisMonth = getCalendarMonthRange(now, 0);
  const lastMonth = getCalendarMonthRange(now, -1);
  const [thisMonthRevenue, lastMonthRevenue] = await Promise.all([
    getRevenueForMonth(stripeAccountId, thisMonth.start, thisMonth.end, now),
    getRevenueForMonth(stripeAccountId, lastMonth.start, lastMonth.end, now),
  ]);

  return {
    monthlyRevenue: thisMonthRevenue,
    revenueGrowth: computeMoMGrowth(thisMonthRevenue, lastMonthRevenue),
  };
}

export async function getRevenueChart6Months(
  stripeAccountId: string | null,
  now: Date = new Date()
): Promise<RevenuePoint[]> {
  const months = Array.from({ length: 6 }, (_, i) => getCalendarMonthRange(now, i - 5));
  const zeros: RevenuePoint[] = months.map((m) => ({ month: formatYearMonth(m.start), revenue: 0 }));

  if (!stripeAccountId) return zeros;
  const account = await getAccountOnce(stripeAccountId);
  if (!account?.charges_enabled) return zeros;

  const revenues = await Promise.all(
    months.map(({ start, end }) => getRevenueForMonth(stripeAccountId, start, end, now))
  );
  return months.map(({ start }, i) => ({
    month: formatYearMonth(start),
    revenue: revenues[i],
  }));
}

export { getAccountOnce };

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function buildMemberGrowthSeries({
  now,
  currentActiveCount,
  joins,
  cancellations,
}: {
  now: Date;
  currentActiveCount: number;
  joins: { at: Date }[];
  cancellations: { at: Date }[];
}): GrowthPoint[] {
  const today = startOfDay(now);
  const startDay = new Date(today.getTime() - 89 * DAY_MS);

  const days: GrowthPoint[] = [];
  for (let i = 0; i < 90; i++) {
    const d = new Date(startDay.getTime() + i * DAY_MS);
    days.push({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      count: currentActiveCount,
    });
  }

  for (const j of joins) {
    const jDay = startOfDay(j.at);
    if (jDay.getTime() < startDay.getTime() || jDay.getTime() > today.getTime()) continue;
    const idx = Math.round((jDay.getTime() - startDay.getTime()) / DAY_MS);
    for (let i = 0; i <= idx; i++) days[i].count -= 1;
  }
  for (const c of cancellations) {
    const cDay = startOfDay(c.at);
    if (cDay.getTime() < startDay.getTime() || cDay.getTime() > today.getTime()) continue;
    const idx = Math.round((cDay.getTime() - startDay.getTime()) / DAY_MS);
    for (let i = 0; i <= idx; i++) days[i].count += 1;
  }

  for (const d of days) if (d.count < 0) d.count = 0;
  return days;
}
