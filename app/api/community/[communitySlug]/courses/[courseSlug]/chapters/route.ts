import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";

interface Community {
  id: string;
}

interface Course {
  id: string;
}

interface Chapter {
  id: string;
  title: string;
  chapter_position: number;
  course_id: string;
  created_at: string;
  updated_at: string;
}

interface HighestPosition {
  chapter_position: number;
}

export async function POST(
  request: Request,
  props: { params: Promise<{ communitySlug: string; courseSlug: string }> }
) {
  const params = await props.params;
  try {
    const { communitySlug, courseSlug } = params;
    const { title } = await request.json();

    // Get community and verify it exists
    const community = await queryOne<Community>`
      SELECT id
      FROM communities
      WHERE slug = ${communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    // Get course and verify it exists
    const course = await queryOne<Course>`
      SELECT id
      FROM courses
      WHERE community_id = ${community.id}
        AND slug = ${courseSlug}
    `;

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // Get the current highest position
    const highestPositionChapter = await queryOne<HighestPosition>`
      SELECT chapter_position
      FROM chapters
      WHERE course_id = ${course.id}
      ORDER BY chapter_position DESC
      LIMIT 1
    `;

    const newPosition = (highestPositionChapter?.chapter_position ?? -1) + 1;

    // Create the new chapter
    const newChapter = await queryOne<Chapter>`
      INSERT INTO chapters (
        title,
        chapter_position,
        course_id,
        created_at,
        updated_at
      ) VALUES (
        ${title},
        ${newPosition},
        ${course.id},
        NOW(),
        NOW()
      )
      RETURNING *
    `;

    if (!newChapter) {
      console.error("Error creating chapter: no row returned");
      return NextResponse.json(
        { error: "Failed to create chapter" },
        { status: 500 }
      );
    }

    // Transform the response for frontend compatibility
    const transformedChapter = {
      ...newChapter,
      lessons: []
    };

    return NextResponse.json(transformedChapter);
  } catch (error) {
    console.error("Error creating chapter:", error);
    return NextResponse.json(
      { error: "Failed to create chapter" },
      { status: 500 }
    );
  }
}

