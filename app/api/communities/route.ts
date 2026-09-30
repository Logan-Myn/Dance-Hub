import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { getUserIsAdmin } from "@/lib/community-data";

// Public listing: only the fields the discovery page and admin pickers read.
// Payment and payout internals stay out of this response.
interface CommunityRow {
  id: string;
  created_at: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  image_focal_x: number | null;
  image_focal_y: number | null;
  image_zoom: string | number | null;
  created_by: string;
  status: string;
  opening_date: string | null;
  members_count: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    // Membership flags for a given user are private: only that user (or a
    // platform admin) may ask for them.
    if (userId) {
      const session = await getSession();
      if (!session) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      if (userId !== session.user.id && !(await getUserIsAdmin(session.user.id))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Get all communities with members count
    const communities = await query<CommunityRow>`
      SELECT
        c.id, c.created_at, c.name, c.slug, c.description, c.image_url,
        c.image_focal_x, c.image_focal_y, c.image_zoom, c.created_by,
        c.status, c.opening_date,
        COALESCE((SELECT COUNT(*) FROM community_members WHERE community_id = c.id AND role != 'admin'), 0)::int as members_count
      FROM communities c
      ORDER BY c.created_at DESC
    `;

    // If userId is provided, also get membership status
    if (userId) {
      const memberCommunities = await query<{ community_id: string }>`
        SELECT community_id
        FROM community_members
        WHERE user_id = ${userId}
      `;

      const memberCommunityIds = new Set(memberCommunities.map((mc) => mc.community_id));

      return NextResponse.json(
        communities.map((community) => ({
          ...community,
          membersCount: community.members_count,
          isMember: memberCommunityIds.has(community.id),
        }))
      );
    }

    return NextResponse.json(
      communities.map((community) => ({
        ...community,
        membersCount: community.members_count,
        isMember: false,
      }))
    );
  } catch (error) {
    console.error("Error fetching communities:", error);
    return NextResponse.json(
      { error: "Failed to fetch communities" },
      { status: 500 }
    );
  }
}
