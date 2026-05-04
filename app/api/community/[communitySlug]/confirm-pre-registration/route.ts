import { NextResponse } from "next/server";
import { sql, queryOne } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import React from "react";
import { getEmailService } from "@/lib/resend/email-service";
import { PreRegistrationConfirmationEmail } from "@/lib/resend/templates/community/pre-registration-confirmation";

const emailService = getEmailService();

interface Community {
  id: string;
  name: string;
  membership_price: number | null;
  stripe_account_id: string | null;
  stripe_price_id: string | null;
  opening_date: string;
}

interface ExistingMember {
  id: string;
}

interface UserProfile {
  full_name: string | null;
  email: string | null;
}

export async function POST(
  request: Request,
  { params }: { params: { communitySlug: string } }
) {
  try {
    const { userId, setupIntentId } = await request.json();

    // Get community details
    const community = await queryOne<Community>`
      SELECT id, name, membership_price, stripe_account_id, stripe_price_id, opening_date
      FROM communities
      WHERE slug = ${params.communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    // Retrieve the SetupIntent to get the payment method and metadata
    const setupIntent = await stripe.setupIntents.retrieve(
      setupIntentId,
      {
        stripeAccount: community.stripe_account_id!,
      }
    );

    if (setupIntent.status !== 'succeeded') {
      return NextResponse.json(
        { error: "Payment method setup incomplete" },
        { status: 400 }
      );
    }

    const paymentMethodId = setupIntent.payment_method as string;
    const customerId = setupIntent.metadata?.stripe_customer_id;
    const platformFeePercentage = parseFloat(setupIntent.metadata?.platform_fee_percentage || '0');

    if (!customerId) {
      return NextResponse.json(
        { error: "Customer ID not found in setup intent" },
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

    // Create a subscription that starts on the opening date
    // Convert opening_date to Unix timestamp
    const openingTimestamp = Math.floor(new Date(community.opening_date).getTime() / 1000);

    // Create subscription with billing_cycle_anchor set to opening date
    const subscription = await stripe.subscriptions.create(
      {
        customer: customerId,
        items: [
          {
            price: community.stripe_price_id!,
          },
        ],
        default_payment_method: paymentMethodId,
        billing_cycle_anchor: openingTimestamp,
        proration_behavior: 'none',
        payment_behavior: 'default_incomplete', // Don't charge immediately
        metadata: {
          user_id: userId,
          community_id: community.id,
          platform_fee_percentage: platformFeePercentage.toString(),
          is_pre_registration: 'true',
        },
      },
      {
        stripeAccount: community.stripe_account_id!,
      }
    );

    // Create member record now that payment method is saved
    try {
      await sql`
        INSERT INTO community_members (
          community_id,
          user_id,
          joined_at,
          pre_registration_date,
          role,
          status,
          stripe_customer_id,
          stripe_subscription_id,
          platform_fee_percentage,
          pre_registration_payment_method_id
        ) VALUES (
          ${community.id},
          ${userId},
          NOW(),
          NOW(),
          'member',
          'pre_registered',
          ${customerId},
          ${subscription.id},
          ${platformFeePercentage},
          ${paymentMethodId}
        )
      `;
    } catch (memberError) {
      console.error("Error creating member record:", memberError);

      // Try to cancel the subscription if member creation fails
      try {
        await stripe.subscriptions.cancel(
          subscription.id,
          {
            stripeAccount: community.stripe_account_id!,
          }
        );
      } catch (cancelError) {
        console.error("Error canceling subscription:", cancelError);
      }

      return NextResponse.json(
        { error: "Failed to confirm pre-registration" },
        { status: 500 }
      );
    }

    // Get user profile for email (userId is Better Auth user ID)
    const userProfile = await queryOne<UserProfile>`
      SELECT full_name, email
      FROM profiles
      WHERE auth_user_id = ${userId}
    `;

    // Send pre-registration confirmation email
    try {
      const communityUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/${params.communitySlug}`;

      await emailService.sendTransactionalEmail(
        userProfile?.email || '',
        `Pre-Registration Confirmed for ${community.name}`,
        React.createElement(PreRegistrationConfirmationEmail, {
          memberName: userProfile?.full_name || 'there',
          communityName: community.name,
          communityUrl: communityUrl,
          openingDate: community.opening_date,
          membershipPrice: (community.membership_price || 0) * 100, // Convert to cents for email template
          currency: 'EUR',
        })
      );

      console.log('Pre-registration confirmation email sent successfully');
    } catch (emailError) {
      console.error('Failed to send pre-registration confirmation email:', emailError);
      // Don't fail the request if email fails
    }

    return NextResponse.json({
      success: true,
      openingDate: community.opening_date,
    });
  } catch (error) {
    console.error("Error confirming pre-registration:", error);
    return NextResponse.json(
      { error: "Failed to confirm pre-registration" },
      { status: 500 }
    );
  }
}
