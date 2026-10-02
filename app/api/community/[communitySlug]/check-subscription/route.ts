import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { requireSession } from '@/lib/community-auth';
import { toMembershipStatus } from '@/lib/community-data';

interface CommunityId {
  id: string;
}

interface MemberStatus {
  status: string;
  subscription_status: string | null;
  current_period_end: string | null;
}

// Polled by PaymentModal after a membership payment to detect when the
// webhook has activated the member. Always reports on the signed-in user.
export async function POST(_request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    const guard = await requireSession();
    if (!guard.ok) return guard.response;
    // Never trust a userId from the request body.
    const userId = guard.session.user.id;
    const { communitySlug } = params;

    // Get community data
    const community = await queryOne<CommunityId>`
      SELECT id
      FROM communities
      WHERE slug = ${communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: 'Community not found' },
        { status: 404 }
      );
    }

    // Check member status
    const member = await queryOne<MemberStatus>`
      SELECT status, subscription_status, current_period_end
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id = ${userId}
    `;

    if (!member) {
      return NextResponse.json({
        hasSubscription: false,
        isMember: false,
        message: 'Not a member of this community'
      });
    }

    // Same rule as every access check (an active membership, including one
    // cancelled but still in its paid period).
    const isActive = toMembershipStatus(member).isMember;

    return NextResponse.json({
      hasSubscription: isActive,
      isMember: isActive,
      status: member.status,
      subscriptionStatus: member.subscription_status,
      currentPeriodEnd: member.current_period_end,
      message: isActive ? 'Member is active' : 'Member is not active'
    });
  } catch (error) {
    console.error('Error checking subscription:', error);
    return NextResponse.json(
      { error: 'Failed to check subscription' },
      { status: 500 }
    );
  }
}
