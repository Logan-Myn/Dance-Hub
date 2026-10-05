import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { requireCommunityManager } from "@/lib/community-auth";
import { getOfferings } from "@/lib/offerings";

const COLUMNS = {
  liveClasses: "offers_live_classes",
  courses: "offers_courses",
  privateLessons: "offers_private_lessons",
} as const;

/** Switch an offering on or off. Body: { liveClasses?: boolean, courses?: boolean, privateLessons?: boolean }. */
export async function PATCH(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await props.params;
  const guard = await requireCommunityManager(communitySlug);
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const patch = Object.fromEntries(
    Object.entries(COLUMNS).flatMap(([key]) => (typeof body?.[key] === "boolean" ? [[key, body[key] as boolean]] : []))
  ) as Partial<Record<keyof typeof COLUMNS, boolean>>;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }

  const row = await queryOne<{ offers_live_classes: boolean | null; offers_courses: boolean | null; offers_private_lessons: boolean | null }>`
    UPDATE communities SET
      offers_live_classes = COALESCE(${patch.liveClasses ?? null}::boolean, offers_live_classes),
      offers_courses = COALESCE(${patch.courses ?? null}::boolean, offers_courses),
      offers_private_lessons = COALESCE(${patch.privateLessons ?? null}::boolean, offers_private_lessons),
      updated_at = NOW()
    WHERE id = ${guard.community.id}
    RETURNING offers_live_classes, offers_courses, offers_private_lessons
  `;
  if (!row) return NextResponse.json({ error: "Community not found" }, { status: 404 });
  return NextResponse.json({ offerings: getOfferings(row) });
}
