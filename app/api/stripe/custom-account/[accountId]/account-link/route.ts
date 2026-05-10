import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

export async function POST(request: Request, props: { params: Promise<{ accountId: string }> }) {
  const params = await props.params;
  try {
    const { accountId } = params;
    const { refreshUrl, returnUrl } = await request.json();

    console.log('Creating account link for:', accountId);

    // Verify the account exists and belongs to a community
    const account = await stripe.accounts.retrieve(accountId);

    if (!account) {
      return NextResponse.json(
        { error: 'Stripe account not found' },
        { status: 404 }
      );
    }

    const communityId = account.metadata?.community_id;
    if (!communityId) {
      return NextResponse.json(
        { error: 'Account not linked to community' },
        { status: 400 }
      );
    }

    // Create an Account Link for bank account setup
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl || `${process.env.NEXTAUTH_URL}/onboarding/bank-account?refresh=true`,
      return_url: returnUrl || `${process.env.NEXTAUTH_URL}/onboarding/verification`,
      type: 'account_onboarding',
      collect: 'eventually_due', // This will collect bank account info
    });

    return NextResponse.json({
      success: true,
      accountLinkUrl: accountLink.url,
      expiresAt: accountLink.expires_at,
    });

  } catch (error: any) {
    console.error('Error creating account link:', error);

    if (error.type === 'StripeError') {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode || 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create account link' },
      { status: 500 }
    );
  }
}
