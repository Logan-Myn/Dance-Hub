import { NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
import { requireSession } from "@/lib/community-auth";

interface Community {
  id: string;
  status: string | null;
  membership_enabled: boolean | null;
  membership_price: number | string | null;
}

interface Member {
  id: string;
}

// Free join only. Paid communities go through join-paid (Stripe subscription)
// and pre-registration communities through join-pre-registration, so this
// route refuses both. The paid test mirrors the client (useJoinCommunity and
// FeedClient): membership_enabled AND membership_price > 0.
export async function POST(_request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    const guard = await requireSession();
    if (!guard.ok) return guard.response;
    // Never trust a userId from the request body.
    const userId = guard.session.user.id;

    // Get community
    const community = await queryOne<Community>`
      SELECT id, status, membership_enabled, membership_price
      FROM communities
      WHERE slug = ${params.communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    if (community.status === 'pre_registration') {
      return NextResponse.json(
        { error: "This community is open for pre-registration only" },
        { status: 400 }
      );
    }

    if (community.status === 'inactive') {
      return NextResponse.json(
        { error: "This community is not accepting new members" },
        { status: 400 }
      );
    }

    // numeric columns can arrive as strings ("20.00"), so coerce.
    const price = Number(community.membership_price ?? 0);
    if (community.membership_enabled && price > 0) {
      return NextResponse.json(
        { error: "This community requires a paid membership" },
        { status: 403 }
      );
    }

    // Check if user is already a member
    const existingMember = await queryOne<Member>`
      SELECT id
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id = ${userId}
    `;

    if (existingMember) {
      return NextResponse.json(
        { error: "User is already a member" },
        { status: 400 }
      );
    }

    // Add member to community_members table
    try {
      await sql`
        INSERT INTO community_members (
          community_id,
          user_id,
          joined_at,
          role,
          status
        ) VALUES (
          ${community.id},
          ${userId},
          NOW(),
          'member',
          'active'
        )
      `;
    } catch (memberError) {
      console.error("Error adding member:", memberError);
      return NextResponse.json(
        { error: "Failed to add member" },
        { status: 500 }
      );
    }

    // Update members_count in communities table
    try {
      await sql`SELECT increment_members_count(${community.id})`;
    } catch (updateError) {
      console.error("Error updating members count:", updateError);
      // Rollback the member addition
      await sql`
        DELETE FROM community_members
        WHERE community_id = ${community.id}
          AND user_id = ${userId}
      `;

      return NextResponse.json(
        { error: "Failed to update members count" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error joining community:", error);
    return NextResponse.json(
      { error: "Failed to join community" },
      { status: 500 }
    );
  }
}
