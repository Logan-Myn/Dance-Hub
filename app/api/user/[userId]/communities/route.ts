import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

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
  created_by: string;
  price: number | null;
  currency: string | null;
  membership_enabled: boolean;
  membership_price: number | null;
  stripe_account_id: string | null;
  stripe_price_id: string | null;
  stripe_onboarding_type: string | null;
  status: string;
  opening_date: string | null;
  thread_categories: unknown;
  custom_links: unknown;
  members_count: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    // Get community IDs the user is a member of
    const memberRows = await sql`
      SELECT community_id FROM community_members WHERE user_id = ${userId}
    `;

    const communityIds = (memberRows as any[]).map((m: any) => m.community_id);

    // Fetch communities by IDs (avoids JOIN issues with Neon pooler)
    let communities: CommunityWithMemberCount[] = [];
    if (communityIds.length > 0) {
      communities = await sql`
        SELECT
          c.*,
          COALESCE((SELECT COUNT(*) FROM community_members WHERE community_id = c.id AND role != 'admin'), 0)::int as members_count
        FROM communities c
        WHERE c.id = ANY(${communityIds})
        ORDER BY c.created_at DESC
      ` as CommunityWithMemberCount[];
    }

    const response = NextResponse.json(
      communities.map((community) => ({
        ...community,
        members_count: community.members_count,
      }))
    );
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
