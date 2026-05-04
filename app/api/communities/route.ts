import { NextRequest, NextResponse } from "next/server";
import { sql, query } from "@/lib/db";

interface CommunityRow {
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    // Get all communities with members count
    const communities = await query<CommunityRow>`
      SELECT
        c.*,
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
