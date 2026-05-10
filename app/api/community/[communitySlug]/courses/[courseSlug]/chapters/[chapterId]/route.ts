import { NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";

interface Community {
  id: string;
  created_by: string;
}

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
    const session = await getSession();

    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const user = session.user;
    const { title } = await request.json();

    // Check if user is the community creator
    const community = await queryOne<Community>`
      SELECT id, created_by
      FROM communities
      WHERE slug = ${params.communitySlug}
    `;

    if (!community) {
      return new NextResponse("Community not found", { status: 404 });
    }

    if (community.created_by !== user.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

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

    // Update the chapter
    try {
      await sql`
        UPDATE chapters
        SET title = ${title}, updated_at = NOW()
        WHERE id = ${params.chapterId}
          AND course_id = ${course.id}
      `;
    } catch (updateError) {
      console.error("[CHAPTER_UPDATE]", updateError);
      return new NextResponse("Failed to update chapter", { status: 500 });
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
    // Verify the session and get user
    const session = await getSession();

    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const user = session.user;

    // Check if user is the community creator
    const community = await queryOne<Community>`
      SELECT id, created_by
      FROM communities
      WHERE slug = ${params.communitySlug}
    `;

    if (!community) {
      return new NextResponse("Community not found", { status: 404 });
    }

    if (community.created_by !== user.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

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

    // Delete all lessons in the chapter first (foreign key constraint)
    try {
      await sql`
        DELETE FROM lessons
        WHERE chapter_id = ${params.chapterId}
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
