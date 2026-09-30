import { NextResponse } from "next/server";
import { sql, query } from "@/lib/db";
import {
  requireCommunityManager,
  requireCommunityViewer,
  userCanManageCommunity,
} from "@/lib/community-auth";

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

export async function GET(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    // The roster is for people inside the community (the feed also lets
    // pre-registered users in).
    const guard = await requireCommunityViewer(params.communitySlug, {
      allowPreRegistered: true,
    });
    if (!guard.ok) return guard.response;
    const { community } = guard;
    const viewerId = guard.session.user.id;
    const canManage = await userCanManageCommunity(viewerId, community.id);

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

    // Emails and billing state are private. The owner/admin sees them for
    // everyone; a member sees their own billing state (the feed reads it)
    // and nobody else's.
    const formattedMembers = membersData.map(member => {
      const isSelf = member.user_id === viewerId;
      return {
        id: member.id,
        displayName: member.full_name || 'Anonymous',
        ...(canManage ? { email: member.email || '' } : {}),
        imageUrl: member.avatar_url || '',
        joinedAt: member.joined_at,
        status: member.status || 'active',
        ...(canManage || isSelf
          ? {
              subscription_status: member.subscription_status,
              current_period_end: member.current_period_end,
            }
          : {}),
        lastActive: member.last_active,
        user_id: member.user_id
      };
    });

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
export async function DELETE(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    const guard = await requireCommunityManager(params.communitySlug);
    if (!guard.ok) return guard.response;
    const { community } = guard;

    const { memberId } = await request.json();
    if (!memberId) {
      return NextResponse.json(
        { error: "Member ID is required" },
        { status: 400 }
      );
    }

    // Scoped to this community so a member row from elsewhere can't be removed.
    const deleted = await sql<{ id: string }[]>`
      DELETE FROM community_members
      WHERE id = ${memberId}
        AND community_id = ${community.id}
      RETURNING id
    `;

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing member:", error);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }
}
