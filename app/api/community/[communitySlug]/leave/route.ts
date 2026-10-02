import { NextResponse } from 'next/server';
import { queryOne, sql } from '@/lib/db';
import { stripe } from "@/lib/stripe";
import { requireSession } from "@/lib/community-auth";
import { toMembershipStatus, type MembershipRow } from "@/lib/community-data";
import { ENDED_SUBSCRIPTION_STATUSES, markMembershipEnded } from "@/lib/membership-ended";
import { cancelPreRegistration, PRE_REGISTERED_STATUSES } from "@/lib/pre-registration";

interface Community {
  id: string;
  stripe_account_id: string | null;
}

interface Member {
  user_id: string;
  community_id: string;
  role: string;
  status: string;
  joined_at: string;
  subscription_status: string | null;
  payment_intent_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_invoice_id: string | null;
  pre_registration_payment_method_id: string | null;
}

async function reconcileIfTerminal(
  stripeSubscriptionId: string,
  stripeAccountId: string,
  communityId: string,
  userId: string,
): Promise<boolean> {
  let stripeStatus: string;
  try {
    const sub = await stripe.subscriptions.retrieve(
      stripeSubscriptionId,
      { stripeAccount: stripeAccountId },
    );
    stripeStatus = sub.status;
  } catch {
    return false;
  }

  if (!ENDED_SUBSCRIPTION_STATUSES.includes(stripeStatus)) {
    return false;
  }

  await markMembershipEnded(communityId, userId, stripeStatus);
  return true;
}

export async function POST(_request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    const guard = await requireSession();
    if (!guard.ok) return guard.response;
    // Only the signed-in user can leave; never trust a userId from the body.
    const userId = guard.session.user.id;

    // Get community with stripe account id
    const community = await queryOne<Community>`
      SELECT id, stripe_account_id
      FROM communities
      WHERE slug = ${params.communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: 'Community not found' },
        { status: 404 }
      );
    }

    // Check if user is a member and get their subscription info
    const member = await queryOne<Member>`
      SELECT *
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id = ${userId}
    `;

    if (!member) {
      return NextResponse.json(
        { error: 'User is not a member of this community' },
        { status: 400 }
      );
    }

    // A pre-registration has no paid period to keep: leaving it is the same
    // as cancelling it. (Cancelling its subscription "at period end" would
    // end it on the opening date and count as a grace period until then.)
    if (PRE_REGISTERED_STATUSES.includes(member.status)) {
      try {
        await cancelPreRegistration({
          communityId: community.id,
          userId,
          stripeAccountId: community.stripe_account_id,
          member,
        });
      } catch (error) {
        console.error('Error cancelling pre-registration on leave:', error);
        return NextResponse.json(
          { error: 'Failed to cancel your pre-registration. Please try again.' },
          { status: 500 }
        );
      }
      return NextResponse.json({
        success: true,
        gracePeriod: false,
        membership: toMembershipStatus(null),
      });
    }

    // Only an active membership has a paid period to run out (or a row to
    // leave). A pending checkout or an ended membership has nothing to leave.
    if (member.status !== 'active') {
      return NextResponse.json(
        { error: 'You are not an active member of this community' },
        { status: 400 }
      );
    }

    let accessEndDate = null;

    // If there's a Stripe subscription, cancel it at period end
    if (member.stripe_subscription_id && community.stripe_account_id) {
      try {
        const subscription = await stripe.subscriptions.update(
          member.stripe_subscription_id,
          {
            cancel_at_period_end: true,
          },
          {
            stripeAccount: community.stripe_account_id,
          }
        );

        const subscriptionItem = subscription.items.data[0] as any;
        const currentPeriodEnd = subscriptionItem?.current_period_end;
        accessEndDate = currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : new Date();

        const [updated] = await sql<MembershipRow[]>`
          UPDATE community_members
          SET subscription_status = 'canceling', current_period_end = ${accessEndDate.toISOString()}
          WHERE community_id = ${community.id}
            AND user_id = ${userId}
          RETURNING status, subscription_status, current_period_end
        `;

        return NextResponse.json({
          success: true,
          accessEndDate: accessEndDate.toISOString(),
          gracePeriod: true,
          membership: toMembershipStatus(updated),
        });
      } catch (error) {
        // If Stripe rejects the update because the subscription is already in a
        // terminal state, our DB has drifted from Stripe — usually because the
        // customer.subscription.deleted webhook never reached this app (e.g. live
        // Stripe webhooks point at prod, not preprod). Reconcile our DB to match
        // Stripe and treat the leave as a successful, already-effective cancellation.
        const reconciled = await reconcileIfTerminal(
          member.stripe_subscription_id,
          community.stripe_account_id,
          community.id,
          userId,
        );
        if (reconciled) {
          return NextResponse.json({
            success: true,
            gracePeriod: false,
            reconciled: true,
          });
        }

        console.error('Error canceling subscription:', error);
        return NextResponse.json(
          { error: 'Failed to cancel subscription. Please try again.' },
          { status: 500 }
        );
      }
    }

    // For free members or if there's no subscription, remove immediately.
    // members_count is kept by a trigger on community_members.
    await sql`
      DELETE FROM community_members
      WHERE community_id = ${community.id}
        AND user_id = ${userId}
    `;

    return NextResponse.json({
      success: true,
      gracePeriod: false
    });
  } catch (error) {
    console.error('Error leaving community:', error);
    return NextResponse.json(
      { error: 'Failed to leave community' },
      { status: 500 }
    );
  }
}
