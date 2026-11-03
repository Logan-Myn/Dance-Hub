import { NextResponse } from "next/server";
import { query, sql } from "@/lib/db";
import { requireCommunityManager } from "@/lib/community-auth";
import { REPLAYS_COURSE_SLUG } from "@/lib/classroom/replays";

// The teacher's course order, saved from the Classroom. Not under
// /courses/[courseSlug], where a course named "order" would shadow it.
// The body lists every course of the community (drafts too, not the live
// class replays), first to last.
export async function PUT(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  const guard = await requireCommunityManager(params.communitySlug);
  if (!guard.ok) return guard.response;

  try {
    const body = await request.json().catch(() => null);
    const ids: unknown = body?.courseIds;
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string") || new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: "courseIds must list each course once" }, { status: 400 });
    }

    const current = await query<{ id: string }>`
      SELECT id FROM courses
      WHERE community_id = ${guard.community.id} AND slug <> ${REPLAYS_COURSE_SLUG}
    `;
    const known = new Set(current.map((c) => c.id));
    if (ids.length !== known.size || !ids.every((id) => known.has(id))) {
      // A course was created or deleted in another tab since the page loaded.
      return NextResponse.json({ error: "Your courses changed. Refresh the page and try again." }, { status: 409 });
    }

    const positions = ids.map((_, i) => i + 1);
    await sql`
      UPDATE courses
      SET position = data.pos
      FROM (
        SELECT unnest(${ids as string[]}::uuid[]) AS id, unnest(${positions}::int[]) AS pos
      ) AS data
      WHERE courses.id = data.id
        AND courses.community_id = ${guard.community.id}
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error saving course order:", error);
    return NextResponse.json({ error: "Couldn't save the course order" }, { status: 500 });
  }
}
