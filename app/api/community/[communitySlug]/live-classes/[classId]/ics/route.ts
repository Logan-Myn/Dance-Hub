import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { requireCommunityViewer } from "@/lib/community-auth";
import { buildIcsEvent, icsFileName } from "@/lib/feed/ics";
import { communityPath } from "@/lib/safe-redirect";

export const dynamic = "force-dynamic";

// One live class as an .ics file, so "Add to calendar" opens the member's
// own calendar app.
export async function GET(
  request: Request,
  props: { params: Promise<{ communitySlug: string; classId: string }> }
) {
  const { communitySlug, classId } = await props.params;
  const guard = await requireCommunityViewer(communitySlug);
  if (!guard.ok) return guard.response;

  const row = await queryOne<{
    id: string; title: string; description: string | null;
    scheduled_start_time: Date | string; duration_minutes: number; status: string;
  }>`
    SELECT id, title, description, scheduled_start_time, duration_minutes, status
    FROM live_classes
    WHERE id = ${classId} AND community_id = ${guard.community.id}
  `;
  if (!row || row.status === "cancelled") {
    return NextResponse.json({ error: "Class not found" }, { status: 404 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const ics = buildIcsEvent({
    uid: `live-class-${row.id}@dance-hub.io`,
    title: `${row.title} (${guard.community.name})`,
    description: row.description,
    url: `${origin}${communityPath(guard.community.slug, "/calendar")}`,
    start: row.scheduled_start_time,
    durationMinutes: row.duration_minutes,
    now: new Date(),
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${icsFileName(row.title, row.scheduled_start_time)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
