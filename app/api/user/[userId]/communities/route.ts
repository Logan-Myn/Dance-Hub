import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/community-auth";
import { getUserIsAdmin } from "@/lib/community-data";

// Disable caching for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface CommunityWithMemberCount {
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
  /** The viewer's own membership, for the community switcher. */
  member_role?: string | null;
  member_joined_at?: string | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  try {
    const { userId } = await params;

    // Only the user themself (or a platform admin) may list their memberships.
    if (userId !== guard.session.user.id && !(await getUserIsAdmin(guard.session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get community IDs the user is an active member of
    const memberRows = await sql`
      SELECT community_id, role, joined_at FROM community_members
      WHERE user_id = ${userId} AND status IN ('active', 'pending')
    `;

    const memberships = new Map(
      (memberRows as any[]).map((m: any) => [m.community_id, { role: m.role, joined_at: m.joined_at }])
    );
    const communityIds = Array.from(memberships.keys());

    // Fetch communities by IDs (avoids JOIN issues with Neon pooler)
    let communities: CommunityWithMemberCount[] = [];
    if (communityIds.length > 0) {
      communities = await sql`
        SELECT
          c.id, c.created_at, c.name, c.slug, c.description, c.image_url,
          c.image_focal_x, c.image_focal_y, c.image_zoom, c.created_by,
          c.status, c.opening_date,
          COALESCE((SELECT COUNT(*) FROM community_members WHERE community_id = c.id AND role != 'admin'), 0)::int as members_count
        FROM communities c
        WHERE c.id = ANY(${communityIds})
        ORDER BY c.created_at DESC
      ` as CommunityWithMemberCount[];
      communities = communities.map((c) => ({
        ...c,
        member_role: memberships.get(c.id)?.role ?? null,
        member_joined_at: memberships.get(c.id)?.joined_at ?? null,
      }));
    }

    const response = NextResponse.json(communities);
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return response;
  } catch (error) {
    console.error("Error fetching user communities:", error);
    return NextResponse.json(
      { error: "Failed to fetch user communities" },
      { status: 500 }
    );
  }
}
