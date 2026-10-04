import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireCommunityViewer } from "@/lib/community-auth";

export const dynamic = "force-dynamic";

// Records a feed visit for "New" post markers (lib/feed/visits.ts). A visit
// from an earlier session (30+ minutes ago) becomes the previous visit.
export async function POST(_request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await props.params;
  const guard = await requireCommunityViewer(communitySlug);
  if (!guard.ok) return guard.response;

  try {
    await sql`
      UPDATE community_members
      SET feed_prev_visit_at = CASE
            WHEN feed_visit_at IS NOT NULL AND feed_visit_at < NOW() - INTERVAL '30 minutes' THEN feed_visit_at
            ELSE feed_prev_visit_at
          END,
          feed_visit_at = NOW()
      WHERE community_id = ${guard.community.id}
        AND user_id = ${guard.session.user.id}
    `;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error recording feed visit:", error);
    return NextResponse.json({ error: "Failed to record visit" }, { status: 500 });
  }
}
