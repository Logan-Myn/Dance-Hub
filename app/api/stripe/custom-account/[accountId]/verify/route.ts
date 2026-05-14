import { NextResponse } from 'next/server';
import { stripe, STRIPE_REQUIREMENT_MESSAGES, isStripeAccountFullyVerified } from '@/lib/stripe';
import { sql } from '@/lib/db';

export async function POST(request: Request, props: { params: Promise<{ accountId: string }> }) {
  const params = await props.params;
  try {
    const { accountId } = params;

    // Get current account status
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

    if (isStripeAccountFullyVerified(account)) {
      // Update onboarding progress to completed
      await sql`
        UPDATE stripe_onboarding_progress
        SET
          current_step = 5,
          completed_steps = ARRAY[1, 2, 3, 4, 5],
          verification_completed_at = NOW(),
          updated_at = NOW()
        WHERE stripe_account_id = ${accountId}
      `;

      return NextResponse.json({
        success: true,
        verified: true,
        accountId: accountId,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        message: 'Account is fully verified and ready to accept payments!'
      });
    }

    // Check for outstanding requirements
    const currentlyDue = account.requirements?.currently_due || [];
    const pastDue = account.requirements?.past_due || [];
    const allRequirements = [...currentlyDue, ...pastDue];

    if (allRequirements.length > 0) {
      const missingRequirements = allRequirements.map(
        req => STRIPE_REQUIREMENT_MESSAGES[req] ?? req
      );

      return NextResponse.json({
        success: false,
        verified: false,
        accountId: accountId,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        requirements: {
          currentlyDue: currentlyDue,
          pastDue: pastDue,
          missing: missingRequirements
        },
        message: 'Account verification incomplete. Please complete the missing requirements.',
        nextSteps: missingRequirements
      });
    }

    // If no outstanding requirements but not fully enabled, might need to wait for Stripe review
    if (!account.charges_enabled || !account.payouts_enabled) {
      return NextResponse.json({
        success: true,
        verified: false,
        accountId: accountId,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        message: 'All requirements completed. Account is under review by Stripe.',
        status: 'pending_review'
      });
    }

    // This shouldn't happen, but handle edge case
    return NextResponse.json({
      success: false,
      verified: false,
      accountId: accountId,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      message: 'Unable to verify account status. Please contact support.',
      status: 'unknown'
    });

  } catch (error: any) {
    console.error('Error verifying custom Stripe account:', error);

    if (error.type === 'StripeError') {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode || 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to verify account' },
      { status: 500 }
    );
  }
}
