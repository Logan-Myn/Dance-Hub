import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";

interface Community {
  id: string;
}

interface FeeChange {
  id: string;
  community_id: string;
  old_fee_percentage: number | null;
  new_fee_percentage: number;
  changed_at: string;
  reason: string | null;
}

interface FeeStats {
  platform_fee_percentage: number;
  count: number;
}

export async function GET(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    // Get community ID from slug
    const community = await queryOne<Community>`
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

    // Get fee change history
    const feeHistory = await query<FeeChange>`
      SELECT *
      FROM fee_changes
      WHERE community_id = ${community.id}
      ORDER BY changed_at DESC
    `;

    // Get current fee statistics using RPC function
    const currentStats = await query<FeeStats>`
      SELECT * FROM get_fee_statistics(${community.id})
    `;

    return NextResponse.json({
      feeHistory,
      currentStats: currentStats?.map((stat: FeeStats) => ({
        feePercentage: stat.platform_fee_percentage,
        memberCount: stat.count
      }))
    });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
