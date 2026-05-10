import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

interface CommunityId {
  id: string;
}

interface MemberStatus {
  status: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
}

// GET handler for check-subscription (via query params)
export async function GET(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const { communitySlug } = params;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

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

    // Check if member has access:
    // - status is 'active' OR
    // - subscription is 'canceling' and current_period_end is in the future
    const now = new Date();
    const periodEnd = member.current_period_end ? new Date(member.current_period_end) : null;
    const hasGracePeriodAccess = member.subscription_status === 'canceling' && periodEnd && periodEnd > now;
    const isActive = member.status === 'active' || hasGracePeriodAccess;

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

export async function POST(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    const { userId } = await request.json();
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

    // Check if member has access:
    // - status is 'active' OR
    // - subscription is 'canceling' and current_period_end is in the future
    const now = new Date();
    const periodEnd = member.current_period_end ? new Date(member.current_period_end) : null;
    const hasGracePeriodAccess = member.subscription_status === 'canceling' && periodEnd && periodEnd > now;
    const isActive = member.status === 'active' || hasGracePeriodAccess;

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
