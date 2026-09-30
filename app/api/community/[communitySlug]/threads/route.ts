import { NextResponse } from "next/server";
import { getCommunityThreads } from "@/lib/community-data";
import { requireCommunityViewer } from "@/lib/community-auth";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(_request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    // Posts are members-only. Same audience as the feed page, which also lets
    // pre-registered users in.
    const guard = await requireCommunityViewer(params.communitySlug, {
      allowPreRegistered: true,
    });
    if (!guard.ok) return guard.response;
    const { community } = guard;

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
