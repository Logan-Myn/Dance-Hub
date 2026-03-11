import { NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { deleteMuxAsset } from "@/lib/mux";

interface Community {
  id: string;
  created_by: string;
}

interface Course {
  id: string;
}

interface Chapter {
  id: string;
}

interface Lesson {
  id: string;
  title: string;
  content: string | null;
  video_asset_id: string | null;
  playback_id: string | null;
  chapter_id: string;
  lesson_position: number;
  created_at: string;
  updated_at: string;
}

export async function PUT(
  request: Request,
  {
    params,
  }: {
    params: {
      communitySlug: string;
      courseSlug: string;
      chapterId: string;
      lessonId: string;
    };
  }
) {
  try {
    const body = await request.json();
    const { title, content, videoAssetId, playbackId } = body;

    // First, verify the community exists and get its ID
    const community = await queryOne<{ id: string }>`
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

    // Get the course ID
    const course = await queryOne<Course>`
      SELECT id
      FROM courses
      WHERE community_id = ${community.id}
        AND slug = ${params.courseSlug}
    `;

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // Verify the chapter exists
    const chapter = await queryOne<Chapter>`
      SELECT id
      FROM chapters
      WHERE course_id = ${course.id}
        AND id = ${params.chapterId}
    `;

    if (!chapter) {
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    }

    // Update the lesson using COALESCE for partial updates
    const updatedLesson = await queryOne<Lesson>`
      UPDATE lessons
      SET
        title = COALESCE(${title ?? null}, title),
        content = COALESCE(${content ?? null}, content),
        video_asset_id = COALESCE(${videoAssetId ?? null}, video_asset_id),
        playback_id = COALESCE(${playbackId ?? null}, playback_id),
        updated_at = NOW()
      WHERE id = ${params.lessonId}
        AND chapter_id = ${params.chapterId}
      RETURNING *
    `;

    if (!updatedLesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    // Transform the response for frontend compatibility
    const transformedLesson = {
      ...updatedLesson,
      order: updatedLesson.lesson_position,
      videoAssetId: updatedLesson.video_asset_id,
      playbackId: updatedLesson.playback_id,
    };

    return NextResponse.json(transformedLesson);
  } catch (error) {
    console.error("Error updating lesson:", error);
    return NextResponse.json(
      { error: "Failed to update lesson" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  {
    params,
  }: {
    params: {
      communitySlug: string;
      courseSlug: string;
      chapterId: string;
      lessonId: string;
    };
  }
) {
  try {
    // Verify auth session
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user;

    // Get community and verify it exists
    const community = await queryOne<Community>`
      SELECT id, created_by
      FROM communities
      WHERE slug = ${params.communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    // Verify user is community creator
    if (community.created_by !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get course and verify it exists
    const course = await queryOne<Course>`
      SELECT id
      FROM courses
      WHERE community_id = ${community.id}
        AND slug = ${params.courseSlug}
    `;

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // Verify chapter exists
    const chapter = await queryOne<Chapter>`
      SELECT id
      FROM chapters
      WHERE course_id = ${course.id}
        AND id = ${params.chapterId}
    `;

    if (!chapter) {
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    }

    // Get the lesson to check if it has a video before deleting
    const lesson = await queryOne<{ video_asset_id: string | null }>`
      SELECT video_asset_id
      FROM lessons
      WHERE id = ${params.lessonId}
        AND chapter_id = ${params.chapterId}
    `;

    if (lesson?.video_asset_id) {
      // Delete the video from Mux if it exists
      await deleteMuxAsset(lesson.video_asset_id);
    }

    // Clean up any linked live class recording
    try {
      await sql`
        DELETE FROM live_class_recordings WHERE lesson_id = ${params.lessonId}
      `;
    } catch (cleanupError) {
      console.error("Error cleaning up recording link:", cleanupError);
    }

    // Delete the lesson
    try {
      await sql`
        DELETE FROM lessons
        WHERE id = ${params.lessonId}
          AND chapter_id = ${params.chapterId}
      `;
    } catch (deleteError) {
      console.error("Error deleting lesson:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete lesson" },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Lesson and associated video deleted successfully" });
  } catch (error) {
    console.error("Error deleting lesson:", error);
    return NextResponse.json(
      { error: "Failed to delete lesson" },
      { status: 500 }
    );
  }
}
