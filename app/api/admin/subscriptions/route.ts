import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { query } from '@/lib/db';
import { Stripe } from 'stripe';
import { requirePlatformAdmin } from '@/lib/community-auth';

interface CommunityStripeAccount {
  stripe_account_id: string | null;
}

export async function GET() {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard.response;

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY is not defined in environment');
    return NextResponse.json(
      { error: 'Stripe configuration is missing' },
      { status: 500 }
    );
  }

  try {
    // Get all connected accounts
    const communities = await query<CommunityStripeAccount>`
      SELECT stripe_account_id
      FROM communities
      WHERE stripe_account_id IS NOT NULL
    `;

    // Fetch main account subscriptions
    const mainAccountSubscriptions = await stripe.subscriptions.list({
      limit: 100,
      status: 'active',
      expand: ['data.customer']
    });

    // Fetch application fees (platform revenue)
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const applicationFees = await stripe.applicationFees.list({
      limit: 100,
      created: {
        gte: Math.floor(firstDayOfMonth.getTime() / 1000)
      }
    });

    // Calculate total platform fees for the current month
    const platformRevenue = applicationFees.data.reduce((acc: number, fee) =>
      acc + (fee.amount / 100), 0
    );

    // Fetch connected accounts subscriptions
    const connectedAccountsSubscriptions = await Promise.all(
      (communities || [])
        .filter((c) => c.stripe_account_id)
        .map(async ({ stripe_account_id }) => {
          const connectedStripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
            apiVersion: '2025-12-15.clover' as Stripe.LatestApiVersion,
            stripeAccount: stripe_account_id!
          });

          const accountSubscriptions = await connectedStripe.subscriptions.list({
            limit: 100,
            status: 'active',
            expand: ['data.customer']
          });

          return {
            account_id: stripe_account_id,
            subscriptions: accountSubscriptions.data
          };
        })
    );

    // Calculate totals
    const totalActiveSubscriptions = mainAccountSubscriptions.data.length +
      connectedAccountsSubscriptions.reduce((acc: number, curr: { subscriptions: any[] }) =>
        acc + curr.subscriptions.length, 0);

    // Calculate total recurring revenue (including main account)
    const totalRecurringRevenue = mainAccountSubscriptions.data.reduce((acc: number, sub) =>
      acc + (sub.items.data[0]?.price?.unit_amount || 0) / 100, 0
    ) + connectedAccountsSubscriptions.reduce((acc: number, curr: { subscriptions: Stripe.Subscription[] }) =>
      acc + curr.subscriptions.reduce((subAcc: number, sub: Stripe.Subscription) =>
        subAcc + (sub.items.data[0]?.price?.unit_amount || 0) / 100, 0
      ), 0
    );

    return NextResponse.json({
      total_active_subscriptions: totalActiveSubscriptions,
      total_recurring_revenue: totalRecurringRevenue,
      platform_revenue: platformRevenue,
      main_account: mainAccountSubscriptions.data,
      connected_accounts: connectedAccountsSubscriptions,
      application_fees: applicationFees.data
    });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscriptions' },
      { status: 500 }
    );
  }
}
