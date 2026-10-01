import { NextResponse } from "next/server";
import { query, queryOne, sql } from "@/lib/db";
import { requireCommunityManager } from "@/lib/community-auth";
import { sanitizeRichTextOrNull } from "@/lib/sanitize-html";

interface Lesson {
  id: string;
  title: string;
  content: string | null;
  lesson_position: number;
  chapter_id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  video_asset_id: string | null;
  playback_id: string | null;
}

export async function PUT(
  req: Request,
  props: {
    params: Promise<{ communitySlug: string; courseSlug: string; chapterId: string }>;
  }
) {
  const params = await props.params;
  try {
    const guard = await requireCommunityManager(params.communitySlug);
    if (!guard.ok) return guard.response;
    const { community } = guard;

    const { lessons } = await req.json();
    if (!Array.isArray(lessons)) {
      return new NextResponse("lessons must be an array", { status: 400 });
    }

    // The chapter must belong to a course in this community.
    const chapter = await queryOne<{ id: string }>`
      SELECT ch.id
      FROM chapters ch
      JOIN courses co ON co.id = ch.course_id
      WHERE ch.id = ${params.chapterId}
        AND co.slug = ${params.courseSlug}
        AND co.community_id = ${community.id}
    `;

    if (!chapter) {
      return new NextResponse("Chapter not found", { status: 404 });
    }

    if (lessons.length > 0) {
      const ids = lessons.map((l: { id: string }) => l.id);
      const positions = lessons.map((_: unknown, i: number) => i);

      await sql`
        UPDATE lessons
        SET lesson_position = data.pos
        FROM (
          SELECT
            unnest(${ids}::uuid[]) AS id,
            unnest(${positions}::int[]) AS pos
        ) AS data
        WHERE lessons.id = data.id
          AND lessons.chapter_id = ${chapter.id}
      `;
    }

    const updatedLessons = await query<Lesson>`
      SELECT *
      FROM lessons
      WHERE chapter_id = ${chapter.id}
      ORDER BY lesson_position ASC
    `;

    const transformedLessons = updatedLessons.map(lesson => ({
      id: lesson.id,
      title: lesson.title,
      content: sanitizeRichTextOrNull(lesson.content),
      lesson_position: lesson.lesson_position,
      chapter_id: lesson.chapter_id,
      created_at: lesson.created_at,
      updated_at: lesson.updated_at,
      created_by: lesson.created_by,
      videoAssetId: lesson.video_asset_id,
      playbackId: lesson.playback_id
    }));

    return NextResponse.json(transformedLessons);
  } catch (error) {
    console.error("Error in reorder lessons:", error);
    return new NextResponse("Failed to update lessons order", { status: 500 });
  }
}
