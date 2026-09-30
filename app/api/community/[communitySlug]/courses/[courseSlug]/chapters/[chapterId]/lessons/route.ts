import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { requireCommunityManager } from "@/lib/community-auth";

interface Course {
  id: string;
}

interface Chapter {
  id: string;
}

interface LessonPosition {
  lesson_position: number;
}

interface Lesson {
  id: string;
  title: string;
  content: string | null;
  video_asset_id: string | null;
  playback_id: string | null;
  lesson_position: number;
  chapter_id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export async function POST(
  req: Request,
  props: { params: Promise<{ communitySlug: string; courseSlug: string; chapterId: string }> }
) {
  const params = await props.params;
  try {
    const guard = await requireCommunityManager(params.communitySlug);
    if (!guard.ok) return guard.response;
    const { community, session } = guard;
    const user = session.user;

    const { title } = await req.json();

    // Get course and verify it belongs to this community
    const course = await queryOne<Course>`
      SELECT id
      FROM courses
      WHERE community_id = ${community.id}
        AND slug = ${params.courseSlug}
    `;

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // Verify the chapter belongs to this course
    const chapter = await queryOne<Chapter>`
      SELECT id
      FROM chapters
      WHERE course_id = ${course.id}
        AND id = ${params.chapterId}
    `;

    if (!chapter) {
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    }

    // Get current highest position
    const highestPositionLesson = await queryOne<LessonPosition>`
      SELECT lesson_position
      FROM lessons
      WHERE chapter_id = ${chapter.id}
      ORDER BY lesson_position DESC
      LIMIT 1
    `;

    const newPosition = (highestPositionLesson?.lesson_position ?? -1) + 1;

    // Create the new lesson
    const lesson = await queryOne<Lesson>`
      INSERT INTO lessons (
        title,
        content,
        video_asset_id,
        playback_id,
        lesson_position,
        chapter_id,
        created_at,
        updated_at,
        created_by
      ) VALUES (
        ${title},
        '',
        NULL,
        NULL,
        ${newPosition},
        ${chapter.id},
        NOW(),
        NOW(),
        ${user.id}
      )
      RETURNING *
    `;

    if (!lesson) {
      console.error("Error creating lesson: no row returned");
      return NextResponse.json({ error: "Failed to create lesson" }, { status: 500 });
    }

    // Transform the response to include videoAssetId and playbackId for frontend compatibility
    const transformedLesson = {
      ...lesson,
      videoAssetId: lesson.video_asset_id,
      playbackId: lesson.playback_id
    };

    return NextResponse.json(transformedLesson);
  } catch (error) {
    console.error("Error creating lesson:", error);
    return NextResponse.json(
      { error: "Failed to create lesson" },
      { status: 500 }
    );
  }
}
