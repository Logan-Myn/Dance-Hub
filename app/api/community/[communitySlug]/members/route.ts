import { NextResponse } from "next/server";
import { sql, query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth-session";

interface CommunityId {
  id: string;
}

interface MemberWithProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  joined_at: string;
  status: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  last_active: string | null;
  user_id: string;
}

export async function GET(
  request: Request,
  { params }: { params: { communitySlug: string } }
) {
  try {
    // Get community ID first
    const community = await queryOne<CommunityId>`
      SELECT id
      FROM communities
      WHERE slug = ${params.communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    // Get members with their profiles (only active members with successful payment).
    // Exclude the community creator/admin — they should not appear in the member roster
    // shown to themselves or other members.
    const membersData = await query<MemberWithProfile>`
      SELECT *
      FROM community_members_with_profiles
      WHERE community_id = ${community.id}
        AND status = 'active'
        AND role != 'admin'
        AND (subscription_status = 'active' OR subscription_status IS NULL)
    `;

    // Format the members data
    const formattedMembers = membersData.map(member => ({
      id: member.id,
      displayName: member.full_name || 'Anonymous',
      email: member.email || '',
      imageUrl: member.avatar_url || '',
      joinedAt: member.joined_at,
      status: member.status || 'active',
      subscription_status: member.subscription_status,
      current_period_end: member.current_period_end,
      lastActive: member.last_active,
      user_id: member.user_id
    }));

    return NextResponse.json({ members: formattedMembers });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE: Remove a member from the community
export async function DELETE(
  request: Request,
  { params }: { params: { communitySlug: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { memberId } = await request.json();
    if (!memberId) {
      return NextResponse.json(
        { error: "Member ID is required" },
        { status: 400 }
      );
    }

    // Get community and check if user is the creator
    const community = await queryOne<{ id: string; created_by: string }>`
      SELECT id, created_by
      FROM communities
      WHERE slug = ${params.communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    // Only the community creator can remove members
    if (community.created_by !== session.user.id) {
      return NextResponse.json(
        { error: "Only the community creator can remove members" },
        { status: 403 }
      );
    }

    // Delete the member
    await sql`
      DELETE FROM community_members
      WHERE id = ${memberId}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing member:", error);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }
}
