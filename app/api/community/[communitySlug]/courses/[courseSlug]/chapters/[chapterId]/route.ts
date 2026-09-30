import { NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
import { requireCommunityManager } from "@/lib/community-auth";

interface Course {
  id: string;
}

export async function PUT(
  request: Request,
  props: {
    params: Promise<{ communitySlug: string; courseSlug: string; chapterId: string }>;
  }
) {
  const params = await props.params;
  try {
    const guard = await requireCommunityManager(params.communitySlug);
    if (!guard.ok) return guard.response;
    const { community } = guard;

    const { title } = await request.json();

    // Get course ID
    const course = await queryOne<Course>`
      SELECT id
      FROM courses
      WHERE community_id = ${community.id}
        AND slug = ${params.courseSlug}
    `;

    if (!course) {
      return new NextResponse("Course not found", { status: 404 });
    }

    // Update the chapter (scoped to this course)
    let updated: { id: string }[];
    try {
      updated = await sql<{ id: string }[]>`
        UPDATE chapters
        SET title = ${title}, updated_at = NOW()
        WHERE id = ${params.chapterId}
          AND course_id = ${course.id}
        RETURNING id
      `;
    } catch (updateError) {
      console.error("[CHAPTER_UPDATE]", updateError);
      return new NextResponse("Failed to update chapter", { status: 500 });
    }

    if (updated.length === 0) {
      return new NextResponse("Chapter not found", { status: 404 });
    }

    return NextResponse.json({ message: "Chapter updated successfully" });
  } catch (error) {
    console.error("[CHAPTER_UPDATE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function DELETE(
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

    // Get course ID
    const course = await queryOne<Course>`
      SELECT id
      FROM courses
      WHERE community_id = ${community.id}
        AND slug = ${params.courseSlug}
    `;

    if (!course) {
      return new NextResponse("Course not found", { status: 404 });
    }

    // The chapter must belong to this course before anything is deleted.
    const chapter = await queryOne<{ id: string }>`
      SELECT id
      FROM chapters
      WHERE id = ${params.chapterId}
        AND course_id = ${course.id}
    `;

    if (!chapter) {
      return new NextResponse("Chapter not found", { status: 404 });
    }

    // Delete all lessons in the chapter first (foreign key constraint)
    try {
      await sql`
        DELETE FROM lessons
        WHERE chapter_id = ${chapter.id}
      `;
    } catch (lessonsDeleteError) {
      console.error("[LESSONS_DELETE]", lessonsDeleteError);
      return new NextResponse("Failed to delete lessons", { status: 500 });
    }

    // Delete the chapter
    try {
      await sql`
        DELETE FROM chapters
        WHERE id = ${params.chapterId}
          AND course_id = ${course.id}
      `;
    } catch (chapterDeleteError) {
      console.error("[CHAPTER_DELETE]", chapterDeleteError);
      return new NextResponse("Failed to delete chapter", { status: 500 });
    }

    return NextResponse.json({
      message: "Chapter and lessons deleted successfully",
    });
  } catch (error) {
    console.error("[CHAPTER_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
