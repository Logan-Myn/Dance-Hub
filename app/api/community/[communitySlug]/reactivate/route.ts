import { NextResponse } from 'next/server';
import { queryOne, sql } from '@/lib/db';
import { stripe } from "@/lib/stripe";
import { requireSession } from "@/lib/community-auth";
import { toMembershipStatus, type MembershipRow } from "@/lib/community-data";
import { ENDED_SUBSCRIPTION_STATUSES, markMembershipEnded } from "@/lib/membership-ended";

interface Community {
  id: string;
  stripe_account_id: string | null;
}

interface Member extends MembershipRow {
  id: string;
  user_id: string;
  community_id: string;
  stripe_subscription_id: string | null;
}

export async function POST(_request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    const guard = await requireSession();
    if (!guard.ok) return guard.response;
    // Only the signed-in user can reactivate their own membership.
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

    // Get member's subscription info
    const member = await queryOne<Member>`
      SELECT *, stripe_subscription_id
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id = ${userId}
    `;

    if (!member) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      );
    }

    if (member.stripe_subscription_id && community.stripe_account_id) {
      // Check standing BEFORE touching the subscription: un-cancelling a
      // past_due / unpaid one would let the next retry charge and renew it
      // while we tell the member it failed.
      const subscription = await stripe.subscriptions.retrieve(
        member.stripe_subscription_id,
        {},
        { stripeAccount: community.stripe_account_id }
      );

      // Stripe already ended it (the webhook that should have told us never
      // arrived). Nothing to un-cancel; the member has to join again.
      if (ENDED_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
        const ended = await markMembershipEnded(community.id, userId, subscription.status);
        return NextResponse.json(
          {
            error: 'Your membership has ended. Join again to continue.',
            membership: toMembershipStatus(ended ?? member),
          },
          { status: 409 }
        );
      }

      if (subscription.status !== 'active' && subscription.status !== 'trialing') {
        console.warn('Reactivate refused, subscription not in good standing:', {
          subscriptionId: member.stripe_subscription_id,
          status: subscription.status,
        });
        return NextResponse.json(
          { error: 'Your membership payment is not up to date. Please update your payment method and try again.' },
          { status: 409 }
        );
      }

      // Reactivate by removing the scheduled cancellation.
      await stripe.subscriptions.update(
        member.stripe_subscription_id,
        { cancel_at_period_end: false },
        { stripeAccount: community.stripe_account_id }
      );

      // Update member status back to active
      const [updated] = await sql<MembershipRow[]>`
        UPDATE community_members
        SET
          status = 'active',
          subscription_status = 'active'
        WHERE community_id = ${community.id}
          AND user_id = ${userId}
        RETURNING status, subscription_status, current_period_end
      `;

      return NextResponse.json({
        success: true,
        membership: toMembershipStatus(updated),
      });
    }

    return NextResponse.json(
      { error: 'No subscription found to reactivate' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error reactivating membership:', error);
    return NextResponse.json(
      { error: 'Failed to reactivate membership' },
      { status: 500 }
    );
  }
}
