import { NextResponse } from 'next/server';
import { queryOne, sql } from '@/lib/db';
import { stripe } from "@/lib/stripe";
import { requireSession } from "@/lib/community-auth";

interface Community {
  id: string;
  stripe_account_id: string | null;
}

interface Member {
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
      // Reactivate Stripe subscription by removing the cancellation
      const subscription = await stripe.subscriptions.update(
        member.stripe_subscription_id,
        {
          cancel_at_period_end: false,
        },
        {
          stripeAccount: community.stripe_account_id,
        }
      );

      // Only grant access back when the subscription is actually in good
      // standing. A past_due / unpaid / incomplete subscription must not flip
      // the member to active; the webhook keeps subscription_status in sync.
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

      // Update member status back to active
      await sql`
        UPDATE community_members
        SET
          status = 'active',
          subscription_status = 'active'
        WHERE community_id = ${community.id}
          AND user_id = ${userId}
      `;

      return NextResponse.json({ success: true });
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
