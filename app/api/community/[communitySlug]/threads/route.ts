import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCommunityThreads } from "@/lib/community-data";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface CommunityId {
  id: string;
}

export async function GET(
  _request: Request,
  { params }: { params: { communitySlug: string } }
) {
  try {
    const { communitySlug } = params;

    const community = await queryOne<CommunityId>`
      SELECT id
      FROM communities
      WHERE slug = ${communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    const threads = await getCommunityThreads(community.id);

    const response = NextResponse.json(threads);
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return response;
  } catch (error) {
    console.error("Error fetching threads:", error);
    return NextResponse.json(
      { error: "Failed to fetch threads" },
      { status: 500 }
    );
  }
}
