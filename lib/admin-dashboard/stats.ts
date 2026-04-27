import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';

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
  const charges = await stripe.charges.list(
    {
      created: {
        gte: Math.floor(start.getTime() / 1000),
        lt: Math.floor(end.getTime() / 1000),
      },
      limit: 100,
    },
    { stripeAccount: stripeAccountId }
  );
  return charges.data.reduce(
    (total: number, c: Stripe.Charge) =>
      c.status === 'succeeded' ? total + c.amount / 100 : total,
    0
  );
}

export async function getMonthlyRevenue(
  stripeAccountId: string | null,
  now: Date = new Date()
): Promise<{ monthlyRevenue: number; revenueGrowth: number }> {
  if (!stripeAccountId) return { monthlyRevenue: 0, revenueGrowth: 0 };

  try {
    const account = await stripe.accounts.retrieve(stripeAccountId);
    if (!account.charges_enabled) return { monthlyRevenue: 0, revenueGrowth: 0 };
  } catch {
    return { monthlyRevenue: 0, revenueGrowth: 0 };
  }

  const thisMonth = getCalendarMonthRange(now, 0);
  const lastMonth = getCalendarMonthRange(now, -1);
  const [thisMonthRevenue, lastMonthRevenue] = await Promise.all([
    sumSucceeded(stripeAccountId, thisMonth.start, thisMonth.end),
    sumSucceeded(stripeAccountId, lastMonth.start, lastMonth.end),
  ]);

  return {
    monthlyRevenue: thisMonthRevenue,
    revenueGrowth: computeMoMGrowth(thisMonthRevenue, lastMonthRevenue),
  };
}
