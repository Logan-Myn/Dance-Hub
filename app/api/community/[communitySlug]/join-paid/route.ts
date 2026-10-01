import { NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { requireSession } from "@/lib/community-auth";
import { LIVE_SUBSCRIPTION_STATUSES, memberSubscriptionStatus } from "@/lib/membership-ended";
import { isMissingStripeResource } from "@/lib/subscription-cancel";

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

const PRE_REGISTERED_STATUSES = ['pre_registered', 'pending_pre_registration'];

export async function POST(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    const guard = await requireSession();
    if (!guard.ok) return guard.response;
    // The member and the Stripe customer email always come from the session,
    // never from the request body.
    const userId = guard.session.user.id;
    const email = guard.session.user.email;
    const { promotionCodeId, plan } = await request.json();

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

    // Pre-registered users already hold a subscription that starts on the
    // opening date; replacing it here would charge them now.
    if (existingMember && PRE_REGISTERED_STATUSES.includes(existingMember.status)) {
      return NextResponse.json(
        { error: "You are already pre-registered for this community" },
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

    const stripeAccount = community.stripe_account_id!;

    // A leftover row from an earlier checkout. Its subscription may already be
    // paid while the webhook hasn't marked the row active yet, so ask Stripe
    // before replacing it: cancelling a paid subscription keeps the payment
    // and the member would pay twice. Only an unpaid ('incomplete') one is
    // cancelled. Skip the lookup when we already know it is terminal.
    const subAlreadyTerminal =
      existingMember?.subscription_status === 'canceled' ||
      existingMember?.subscription_status === 'incomplete_expired' ||
      existingMember?.subscription_status === 'unpaid';

    let oldSubscriptionToCancel: string | null = null;
    if (existingMember?.stripe_subscription_id && !subAlreadyTerminal) {
      let oldSubscription: Stripe.Subscription | null = null;
      try {
        oldSubscription = await stripe.subscriptions.retrieve(
          existingMember.stripe_subscription_id,
          { stripeAccount }
        );
      } catch (retrieveError) {
        if (!isMissingStripeResource(retrieveError)) throw retrieveError;
      }

      if (oldSubscription && LIVE_SUBSCRIPTION_STATUSES.includes(oldSubscription.status)) {
        await sql`
          UPDATE community_members
          SET status = 'active',
              subscription_status = ${memberSubscriptionStatus(oldSubscription)}
          WHERE id = ${existingMember.id}
            AND stripe_subscription_id = ${oldSubscription.id}
        `;
        return NextResponse.json(
          { error: "You're already a member of this community.", alreadyMember: true },
          { status: 409 }
        );
      }
      if (oldSubscription?.status === 'incomplete') {
        oldSubscriptionToCancel = oldSubscription.id;
      }
    }

    // Claim the (community, user) row before creating anything in Stripe, so
    // two requests at once (a double click) can't both create a subscription:
    // the unique (user_id, community_id) key lets only one INSERT through. The
    // leftover row is removed only if it is unchanged since we read it. A
    // pending row without a subscription is another join still running; it is
    // replaced only once it is 2 minutes old (that request died mid-way).
    if (existingMember?.stripe_subscription_id) {
      await sql`
        DELETE FROM community_members
        WHERE id = ${existingMember.id}
          AND status <> 'active'
          AND stripe_subscription_id = ${existingMember.stripe_subscription_id}
      `;
    } else if (existingMember) {
      await sql`
        DELETE FROM community_members
        WHERE id = ${existingMember.id}
          AND status <> 'active'
          AND stripe_subscription_id IS NULL
          AND (status <> 'pending' OR joined_at < NOW() - INTERVAL '2 minutes')
      `;
    }

    const [claim] = await sql<{ id: string }[]>`
      INSERT INTO community_members (
        community_id,
        user_id,
        joined_at,
        role,
        status,
        subscription_status,
        platform_fee_percentage
      ) VALUES (
        ${community.id},
        ${userId},
        NOW(),
        'member',
        'pending',
        'incomplete',
        ${feePercentage}
      )
      ON CONFLICT (user_id, community_id) DO NOTHING
      RETURNING id
    `;

    if (!claim) {
      // The leftover row may have become active in the meantime (the webhook).
      const current = await queryOne<{ status: string }>`
        SELECT status FROM community_members
        WHERE community_id = ${community.id}
          AND user_id = ${userId}
      `;
      if (current?.status === 'active') {
        return NextResponse.json(
          { error: "You're already a member of this community.", alreadyMember: true },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Your checkout is already being set up. Please wait a moment and try again." },
        { status: 409 }
      );
    }

    let newSubscriptionId: string | null = null;
    // Undo a join that failed after the claim: cancel the new subscription (if
    // any) and drop the row, so the user can simply try again.
    const releaseClaim = async () => {
      if (newSubscriptionId) {
        try {
          await stripe.subscriptions.cancel(newSubscriptionId, { stripeAccount });
        } catch (cancelError) {
          console.error("Error canceling subscription:", cancelError);
        }
      }
      try {
        await sql`DELETE FROM community_members WHERE id = ${claim.id}`;
      } catch (deleteError) {
        console.error("Error releasing the membership row:", deleteError);
      }
    };

    try {
      const cancelOldSubscription = async () => {
        if (!oldSubscriptionToCancel) return;
        try {
          await stripe.subscriptions.cancel(oldSubscriptionToCancel, { stripeAccount });
        } catch (cancelError) {
          console.error("Error canceling old subscription:", cancelError);
        }
      };

      const [, customer] = await Promise.all([
        cancelOldSubscription(),
        stripe.customers.create(
          {
            email,
            metadata: {
              user_id: userId,
              community_id: community.id,
            },
          },
          { stripeAccount }
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
        { stripeAccount }
      );
      newSubscriptionId = subscription.id;

      // Link the subscription to the claimed row right away: the webhook
      // matches rows on stripe_subscription_id, and a fully-discounted first
      // invoice is paid (and reported) as soon as the subscription exists.
      const attached = await sql<{ id: string }[]>`
        UPDATE community_members
        SET stripe_customer_id = ${customer.id},
            stripe_subscription_id = ${subscription.id}
        WHERE id = ${claim.id}
          AND stripe_subscription_id IS NULL
        RETURNING id
      `;
      if (attached.length === 0) {
        console.error("Membership row disappeared while joining:", { memberId: claim.id });
        await releaseClaim();
        return NextResponse.json(
          { error: "Failed to add member" },
          { status: 500 }
        );
      }

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
          { stripeAccount }
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
        await releaseClaim();
        return NextResponse.json(
          { error: "Failed to initialize payment. Please try again." },
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
    } catch (joinError) {
      await releaseClaim();
      throw joinError;
    }
  } catch (error) {
    console.error("Error creating subscription:", error);
    return NextResponse.json(
      { error: "Failed to create subscription" },
      { status: 500 }
    );
  }
}
