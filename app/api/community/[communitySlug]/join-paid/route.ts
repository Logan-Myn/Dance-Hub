import { NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";

interface Community {
  id: string;
  membership_price: number | null;
  stripe_account_id: string | null;
  stripe_price_id: string | null;
  stripe_yearly_price_id: string | null;
  yearly_enabled: boolean | null;
  active_member_count: number | null;
  created_at: string;
  promotional_fee_percentage: number | null;
}

interface ExistingMember {
  id: string;
  status: string;
  subscription_status: string | null;
  stripe_subscription_id: string | null;
}

export async function POST(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    const { userId, email, promotionCodeId, plan } = await request.json();

    // Get community with its membership price and stripe account
    const community = await queryOne<Community>`
      SELECT id, membership_price, stripe_account_id, stripe_price_id, stripe_yearly_price_id, yearly_enabled, active_member_count, created_at, promotional_fee_percentage
      FROM communities
      WHERE slug = ${params.communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    const useYearly = plan === 'yearly';
    if (useYearly && (!community.yearly_enabled || !community.stripe_yearly_price_id)) {
      return NextResponse.json(
        { error: "Yearly membership is not available for this community" },
        { status: 400 }
      );
    }
    const selectedPriceId = useYearly ? community.stripe_yearly_price_id : community.stripe_price_id;
    if (!selectedPriceId) {
      return NextResponse.json(
        { error: "Community membership price not configured" },
        { status: 400 }
      );
    }

    // Check if this member should get promotional pricing (community < 30 days old)
    const communityAge = Date.now() - new Date(community.created_at).getTime();
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
    const isPromotional = communityAge < thirtyDaysInMs;

    // Calculate platform fee percentage
    let feePercentage = 0; // Default promotional rate

    if (!isPromotional) {
      // Use standard tiered pricing if not in promotional period
      if ((community.active_member_count || 0) <= 50) {
        feePercentage = 8.0;
      } else if ((community.active_member_count || 0) <= 100) {
        feePercentage = 6.0;
      } else {
        feePercentage = 4.0;
      }
    }

    // Check if user is already a member
    const existingMember = await queryOne<ExistingMember>`
      SELECT id, status, subscription_status, stripe_subscription_id
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id = ${userId}
    `;

    if (existingMember && existingMember.status === 'active') {
      return NextResponse.json(
        { error: "User is already a member" },
        { status: 400 }
      );
    }

    // Enforce the promo code's per-plan scope on the money path too. Validation
    // is bypassable via a direct request, and because monthly and yearly reuse
    // one Stripe product we cannot rely on Stripe to scope the coupon. A missing
    // mirror row is treated as unrestricted ('both'). Reject before creating any
    // Stripe objects.
    if (promotionCodeId) {
      const scopeRow = await queryOne<{ applies_to_plan: string }>`
        SELECT applies_to_plan FROM community_promo_codes
        WHERE community_id = ${community.id}
          AND stripe_promotion_code_id = ${promotionCodeId}
        LIMIT 1
      `;
      const scope = scopeRow?.applies_to_plan ?? 'both';
      if (scope !== 'both' && scope !== (useYearly ? 'yearly' : 'monthly')) {
        return NextResponse.json(
          { error: 'This code does not apply to the selected plan.' },
          { status: 400 }
        );
      }
    }

    // Cleanup of any prior non-active membership (incomplete signup,
    // left/auto-cancelled, grace-period 'canceling') runs in parallel with the
    // new Stripe customer creation — they're independent, and the next call
    // (subscription.create) is the only one that depends on the new customer.
    // Skip the leftover-sub cancel when we already know it's terminal (would
    // just round-trip to an "already canceled" error).
    const subAlreadyTerminal =
      existingMember?.subscription_status === 'canceled' ||
      existingMember?.subscription_status === 'incomplete_expired' ||
      existingMember?.subscription_status === 'unpaid';

    const cleanupOldSubscription = async () => {
      if (!existingMember?.stripe_subscription_id || subAlreadyTerminal) return;
      try {
        await stripe.subscriptions.cancel(
          existingMember.stripe_subscription_id,
          { stripeAccount: community.stripe_account_id! }
        );
      } catch (cancelError) {
        console.error("Error canceling old subscription:", cancelError);
      }
    };

    const cleanupOldRow = async () => {
      if (!existingMember) return;
      await sql`
        DELETE FROM community_members
        WHERE id = ${existingMember.id}
      `;
    };

    const [, , customer] = await Promise.all([
      cleanupOldSubscription(),
      cleanupOldRow(),
      stripe.customers.create(
        {
          email,
          metadata: {
            user_id: userId,
            community_id: community.id,
          },
        },
        { stripeAccount: community.stripe_account_id! }
      ),
    ]);

    // Create a subscription with the calculated platform fee
    // Note: In Clover API version, use 'latest_invoice.confirmation_secret' instead of 'latest_invoice.payment_intent'
    const subscription = await stripe.subscriptions.create(
      {
        customer: customer.id,
        items: [{ price: selectedPriceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: {
          payment_method_types: ['card'],
          save_default_payment_method: 'on_subscription'
        },
        metadata: {
          user_id: userId,
          community_id: community.id,
          platform_fee_percentage: feePercentage
        },
        application_fee_percent: feePercentage,
        ...(promotionCodeId ? { discounts: [{ promotion_code: promotionCodeId }] } : {}),
        expand: ['latest_invoice.confirmation_secret'],
      },
      {
        stripeAccount: community.stripe_account_id!,
      }
    );

    // Get the client secret from the subscription's invoice confirmation_secret (Clover API)
    const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null;
    const confirmationSecret = (latestInvoice as any)?.confirmation_secret;
    const amountDue = (latestInvoice as any)?.amount_due ?? null;

    // Normal path: there is a payment to confirm on the first invoice.
    let clientSecret: string | null = confirmationSecret?.client_secret ?? null;
    let requiresSetup = false;

    // Fully-discounted first invoice (e.g. a 100%-off code): Stripe creates no
    // PaymentIntent, so there is nothing to confirm. Collect a card via a
    // SetupIntent so renewals at full price can charge later. A webhook
    // (setup_intent.succeeded) sets it as the subscription's default method.
    if (!clientSecret && amountDue === 0) {
      const setupIntent = await stripe.setupIntents.create(
        {
          customer: customer.id,
          usage: 'off_session',
          payment_method_types: ['card'],
          metadata: {
            subscription_id: subscription.id,
            community_id: community.id,
            user_id: userId,
          },
        },
        { stripeAccount: community.stripe_account_id! }
      );
      clientSecret = setupIntent.client_secret;
      requiresSetup = true;
    }

    if (!clientSecret) {
      console.error("No confirmation secret or setup intent for subscription:", {
        subscriptionId: subscription.id,
        latestInvoiceId: latestInvoice?.id,
        amountDue,
      });
      // Clean up - cancel the subscription since we can't complete payment
      await stripe.subscriptions.cancel(subscription.id, {
        stripeAccount: community.stripe_account_id!,
      });
      return NextResponse.json(
        { error: "Failed to initialize payment. Please try again." },
        { status: 500 }
      );
    }

    // Add member to community_members table with the platform fee percentage
    try {
      await sql`
        INSERT INTO community_members (
          community_id,
          user_id,
          joined_at,
          role,
          status,
          subscription_status,
          stripe_customer_id,
          stripe_subscription_id,
          platform_fee_percentage
        ) VALUES (
          ${community.id},
          ${userId},
          NOW(),
          'member',
          'pending',
          'incomplete',
          ${customer.id},
          ${subscription.id},
          ${feePercentage}
        )
      `;
    } catch (memberError) {
      console.error("Error adding member:", memberError);
      // Cancel the subscription if member creation fails
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
        { error: "Failed to add member" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      clientSecret,
      requiresSetup,
      amountDue,
      stripeAccountId: community.stripe_account_id,
      subscriptionId: subscription.id
    });
  } catch (error) {
    console.error("Error creating subscription:", error);
    return NextResponse.json(
      { error: "Failed to create subscription" },
      { status: 500 }
    );
  }
}
