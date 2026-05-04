import { NextResponse } from "next/server";
import { query, queryOne, sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";

interface Community {
  id: string;
  created_by: string;
}

interface Course {
  id: string;
}

interface Chapter {
  id: string;
  course_id: string;
  title: string;
  chapter_position: number;
  created_at: string;
  updated_at: string;
}

export async function PUT(
  req: Request,
  { params }: { params: { communitySlug: string; courseSlug: string } }
) {
  try {
    const { chapters } = await req.json();

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

    // Bulk-update all positions in a single statement so a 20-chapter reorder
    // is one round-trip instead of 20.
    if (chapters.length > 0) {
      const ids = chapters.map((c: { id: string }) => c.id);
      const positions = chapters.map((_: unknown, i: number) => i);
      const titles = chapters.map((c: { title: string }) => c.title);

      await sql`
        UPDATE chapters
        SET chapter_position = data.pos,
            title = data.title
        FROM (
          SELECT
            unnest(${ids}::uuid[]) AS id,
            unnest(${positions}::int[]) AS pos,
            unnest(${titles}::text[]) AS title
        ) AS data
        WHERE chapters.id = data.id
          AND chapters.course_id = ${course.id}
      `;
    }

    // Fetch updated chapters
    const updatedChapters = await query<Chapter>`
      SELECT *
      FROM chapters
      WHERE course_id = ${course.id}
      ORDER BY chapter_position ASC
    `;

    return NextResponse.json(updatedChapters);
  } catch (error) {
    console.error("Error in reorder chapters:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
