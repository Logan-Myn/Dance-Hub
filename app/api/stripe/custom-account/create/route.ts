import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { queryOne, sql } from '@/lib/db';
import { getSession } from '@/lib/auth-session';
import { isConnectedAccountGone, stripeErrorReply } from '@/lib/stripe-connect-errors';

// The wizard reacts to `code` and loads the linked account instead.
const ACCOUNT_EXISTS = {
  error: 'This community already has a payout account',
  code: 'account_exists',
};

interface Community {
  id: string;
  created_by: string;
  stripe_account_id: string | null;
}

export async function POST(request: Request) {
  try {
    // Verify authentication
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user;

    const { communityId, country = 'US', businessType = 'individual' } = await request.json();

    if (!communityId) {
      return NextResponse.json(
        { error: 'Community ID is required' },
        { status: 400 }
      );
    }

    // Verify user owns this community
    const community = await queryOne<Community>`
      SELECT id, created_by, stripe_account_id
      FROM communities
      WHERE id = ${communityId}
        AND created_by = ${user.id}
    `;

    if (!community) {
      return NextResponse.json(
        { error: 'Community not found or unauthorized' },
        { status: 404 }
      );
    }

    // If community has a stripe_account_id, verify it's still valid
    if (community.stripe_account_id) {
      try {
        await stripe.accounts.retrieve(community.stripe_account_id);
        return NextResponse.json(ACCOUNT_EXISTS, { status: 400 });
      } catch (stripeError: any) {
        if (!isConnectedAccountGone(stripeError)) {
          // A network error, rate limit or outage says nothing about the
          // account. Keep the link; unlinking would re-point a live community
          // at an empty account.
          console.error('Could not check the existing Stripe account:', stripeError);
          return NextResponse.json(
            { error: 'We could not reach the payment provider. Please try again in a moment.' },
            { status: 502 }
          );
        }
        // Logged as an error so a wrongly unlinked account can be found and
        // restored (UPDATE communities SET stripe_account_id = '<old id>').
        console.error('Unlinking Stripe account that Stripe reports as gone', {
          communityId,
          oldStripeAccountId: community.stripe_account_id,
          code: stripeError?.code,
          statusCode: stripeError?.statusCode,
          message: stripeError?.message,
        });
        // Only clear the id we checked, never one another request just saved.
        await sql`
          UPDATE communities
          SET stripe_account_id = NULL
          WHERE id = ${communityId}
            AND stripe_account_id = ${community.stripe_account_id}
        `;
      }
    }

    // Create a Stripe Custom account for custom onboarding
    const account = await stripe.accounts.create({
      type: 'custom',
      country: country,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: businessType,
      tos_acceptance: {
        service_agreement: 'full'
      },
      metadata: {
        community_id: communityId,
      },
    });

    // Link the new account only if the community still has none, so two
    // concurrent requests can't overwrite each other's account.
    let saved: { id: string } | null;
    try {
      saved = await queryOne<{ id: string }>`
        UPDATE communities
        SET stripe_account_id = ${account.id}, stripe_onboarding_type = 'custom'
        WHERE id = ${communityId}
          AND stripe_account_id IS NULL
        RETURNING id
      `;
    } catch (updateError) {
      // If database update fails, we should delete the Stripe account
      await stripe.accounts.del(account.id);
      throw updateError;
    }

    if (!saved) {
      // Another request linked an account first. Keep theirs, drop ours.
      try {
        await stripe.accounts.del(account.id);
      } catch (delError) {
        console.error('Could not delete the unused Stripe account:', account.id, delError);
      }
      return NextResponse.json(ACCOUNT_EXISTS, { status: 400 });
    }

    // Initialize onboarding progress tracking
    try {
      await sql`
        INSERT INTO stripe_onboarding_progress (
          community_id,
          stripe_account_id,
          current_step,
          completed_steps,
          business_info,
          personal_info,
          bank_account,
          documents,
          created_at,
          updated_at
        ) VALUES (
          ${communityId},
          ${account.id},
          1,
          '{}'::integer[],
          '{}'::jsonb,
          '{}'::jsonb,
          '{}'::jsonb,
          '[]'::jsonb,
          NOW(),
          NOW()
        )
      `;
    } catch (progressError) {
      console.warn('Failed to create onboarding progress tracking:', progressError);
      // Don't fail the request, just log the warning
    }

    return NextResponse.json({
      accountId: account.id,
      country: account.country,
      defaultCurrency: account.default_currency,
      businessType: account.business_type,
      currentStep: 1,
      message: 'Stripe account created successfully. Ready for custom onboarding.'
    });

  } catch (error: any) {
    console.error('Error creating custom Stripe account:', error);

    // error.type is the subclass name, never 'StripeError', so check the class.
    const reply = stripeErrorReply(error);
    if (reply) {
      return NextResponse.json({ error: reply.error }, { status: reply.status });
    }

    return NextResponse.json(
      { error: 'Failed to create payout account' },
      { status: 500 }
    );
  }
}
