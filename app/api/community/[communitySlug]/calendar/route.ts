import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { requireCommunityViewer } from "@/lib/community-auth";
import { getCalendarItems } from "@/lib/calendar/data";
import { parseRangeParams } from "@/lib/calendar-week";
import { getUserIsAdmin } from "@/lib/community-data";
import { REPLAYS_COURSE_SLUG } from "@/lib/classroom/replays";

export const dynamic = "force-dynamic";

const MAX_RANGE_MS = 120 * 24 * 60 * 60 * 1000;

// Classes and the viewer's private lessons in a time range, for the calendar.
export async function GET(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await props.params;
  const guard = await requireCommunityViewer(communitySlug);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const range = parseRangeParams(searchParams.get("start") ?? "", searchParams.get("end") ?? "");
  if (!range || range.end.getTime() - range.start.getTime() > MAX_RANGE_MS) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const userId = guard.session.user.id;
  const canManage = guard.community.created_by === userId || (await getUserIsAdmin(userId));
  const replays = await queryOne<{ is_public: boolean | null }>`
    SELECT is_public FROM courses WHERE community_id = ${guard.community.id} AND slug = ${REPLAYS_COURSE_SLUG}
  `;
  const offers = await queryOne<{ offers_private_lessons: boolean | null; offers_courses: boolean | null }>`
    SELECT offers_private_lessons, offers_courses FROM communities WHERE id = ${guard.community.id}
  `;

  try {
    const items = await getCalendarItems({
      communityId: guard.community.id,
      viewerId: userId,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      includeReplays: offers?.offers_courses !== false && !!replays && (canManage || replays.is_public !== false),
      includeLessons: offers?.offers_private_lessons !== false,
    });
    return NextResponse.json(items);
  } catch (error) {
    console.error("Error loading calendar:", error);
    return NextResponse.json({ error: "Failed to load the calendar" }, { status: 500 });
  }
}
