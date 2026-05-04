import { NextResponse } from "next/server";
import { sql, queryOne } from "@/lib/db";
import { stripe } from "@/lib/stripe";

interface CommunityDetails {
  id: string;
  membership_price: number | null;
  stripe_account_id: string;
  stripe_price_id: string | null;
  active_member_count: number;
  created_at: string;
  promotional_fee_percentage: number | null;
  status: string;
  opening_date: string | null;
}

interface ExistingMember {
  id: string;
}

export async function POST(
  request: Request,
  { params }: { params: { communitySlug: string } }
) {
  try {
    const { userId, email } = await request.json();

    // Get community details
    const community = await queryOne<CommunityDetails>`
      SELECT
        id,
        membership_price,
        stripe_account_id,
        stripe_price_id,
        active_member_count,
        created_at,
        promotional_fee_percentage,
        status,
        opening_date
      FROM communities
      WHERE slug = ${params.communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    // Verify community is in pre-registration status
    if (community.status !== 'pre_registration') {
      return NextResponse.json(
        { error: "Community is not accepting pre-registrations" },
        { status: 400 }
      );
    }

    if (!community.opening_date) {
      return NextResponse.json(
        { error: "Community opening date not set" },
        { status: 400 }
      );
    }

    if (!community.stripe_price_id) {
      return NextResponse.json(
        { error: "Community membership price not configured" },
        { status: 400 }
      );
    }

    // Check if opening date is in the past
    if (new Date(community.opening_date) <= new Date()) {
      return NextResponse.json(
        { error: "Community opening date has passed" },
        { status: 400 }
      );
    }

    // Check if user is already a member or pre-registered
    const existingMember = await queryOne<ExistingMember>`
      SELECT id
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id = ${userId}
    `;

    if (existingMember) {
      return NextResponse.json(
        { error: "User is already a member or pre-registered" },
        { status: 400 }
      );
    }

    // Calculate platform fee percentage (same logic as regular join)
    const communityAge = Date.now() - new Date(community.created_at).getTime();
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
    const isPromotional = communityAge < thirtyDaysInMs;

    let feePercentage = 0;

    if (!isPromotional) {
      if (community.active_member_count <= 50) {
        feePercentage = 8.0;
      } else if (community.active_member_count <= 100) {
        feePercentage = 6.0;
      } else {
        feePercentage = 4.0;
      }
    }

    // Create Stripe customer on connected account
    const customer = await stripe.customers.create(
      {
        email,
        metadata: {
          user_id: userId,
          community_id: community.id,
          is_pre_registration: 'true'
        },
      },
      {
        stripeAccount: community.stripe_account_id,
      }
    );

    // Create SetupIntent to save payment method without charging
    const setupIntent = await stripe.setupIntents.create(
      {
        customer: customer.id,
        payment_method_types: ['card'],
        metadata: {
          user_id: userId,
          community_id: community.id,
          platform_fee_percentage: feePercentage.toString(),
          opening_date: community.opening_date,
          stripe_customer_id: customer.id,
        },
      },
      {
        stripeAccount: community.stripe_account_id,
      }
    );

    // Return setup intent details for payment method collection
    // Member record will be created after payment method is successfully saved
    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      stripeAccountId: community.stripe_account_id,
      setupIntentId: setupIntent.id,
      openingDate: community.opening_date,
      customerId: customer.id,
      platformFeePercentage: feePercentage,
    });
  } catch (error) {
    console.error("Error creating pre-registration:", error);
    return NextResponse.json(
      { error: "Failed to create pre-registration" },
      { status: 500 }
    );
  }
}
