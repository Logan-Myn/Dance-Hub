import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { queryOne, sql } from '@/lib/db';
import { getSession } from '@/lib/auth-session';

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
      console.log('Checking if existing Stripe account is valid:', community.stripe_account_id);
      try {
        await stripe.accounts.retrieve(community.stripe_account_id);
        console.log('Existing Stripe account is valid');
        return NextResponse.json(
          { error: 'Community already has a Stripe account' },
          { status: 400 }
        );
      } catch (stripeError: any) {
        console.log('Existing Stripe account is invalid:', stripeError.message);
        // Account doesn't exist or is invalid, clear it from database and continue
        await sql`
          UPDATE communities
          SET stripe_account_id = NULL
          WHERE id = ${communityId}
        `;
        console.log('Cleared invalid stripe_account_id from database');
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

    // Update the community with the Stripe account ID
    try {
      await sql`
        UPDATE communities
        SET stripe_account_id = ${account.id}, stripe_onboarding_type = 'custom'
        WHERE id = ${communityId}
      `;
    } catch (updateError) {
      // If database update fails, we should delete the Stripe account
      await stripe.accounts.del(account.id);
      throw updateError;
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
      businessType: account.business_type,
      currentStep: 1,
      message: 'Stripe account created successfully. Ready for custom onboarding.'
    });

  } catch (error: any) {
    console.error('Error creating custom Stripe account:', error);

    if (error.type === 'StripeError') {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode || 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create Stripe account' },
      { status: 500 }
    );
  }
}
