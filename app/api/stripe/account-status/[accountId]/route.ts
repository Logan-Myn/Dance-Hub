import { NextResponse } from 'next/server';
import { stripe, mapStripeRequirement, isStripeAccountFullyVerified } from '@/lib/stripe';

export async function GET(request: Request, props: { params: Promise<{ accountId: string }> }) {
  const params = await props.params;
  try {
    const { accountId } = params;

    const account = await stripe.accounts.retrieve(accountId);

    const requirements = {
      currentlyDue: (account.requirements?.currently_due ?? []).map(mapStripeRequirement),
      pastDue: (account.requirements?.past_due ?? []).map(mapStripeRequirement),
      eventuallyDue: (account.requirements?.eventually_due ?? []).map(mapStripeRequirement),
      currentDeadline: account.requirements?.current_deadline,
      disabledReason: account.requirements?.disabled_reason,
    };

    const isEnabled = isStripeAccountFullyVerified(account);
    const needsSetup = !isEnabled;

    return NextResponse.json({
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      requirements,
      businessType: account.business_type,
      capabilities: account.capabilities,
      payoutSchedule: account.settings?.payouts?.schedule,
      defaultCurrency: account.default_currency,
      email: account.email,
      isEnabled,
      needsSetup,
    });
  } catch (error: any) {
    console.error('Error fetching Stripe account status:', error);
    if (error.type === 'StripeError') {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode || 500 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to fetch Stripe account status' },
      { status: 500 }
    );
  }
}
