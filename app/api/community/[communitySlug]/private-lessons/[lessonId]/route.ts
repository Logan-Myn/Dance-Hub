import { NextResponse } from "next/server";
import { query, queryOne, sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { CreatePrivateLessonData } from "@/types/private-lessons";

interface Community {
  id: string;
  created_by: string;
}

interface PrivateLesson {
  id: string;
  community_id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  regular_price: number;
  member_price: number | null;
  is_active: boolean;
  daily_room_name: string | null;
  daily_room_url: string | null;
  created_at: string;
  updated_at: string;
}

interface Booking {
  id: string;
}

export async function GET(
  request: Request,
  { params }: { params: { communitySlug: string; lessonId: string } }
) {
  try {
    const { communitySlug, lessonId } = params;

    // Get community ID from slug
    const community = await queryOne<{ id: string }>`
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

    // Get the specific private lesson
    const lesson = await queryOne<PrivateLesson>`
      SELECT *
      FROM private_lessons
      WHERE id = ${lessonId}
        AND community_id = ${community.id}
    `;

    if (!lesson) {
      return NextResponse.json(
        { error: "Private lesson not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ lesson });
  } catch (error) {
    console.error("Error in GET /api/community/[communitySlug]/private-lessons/[lessonId]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { communitySlug: string; lessonId: string } }
) {
  try {
    const { communitySlug, lessonId } = params;
    const updateData: Partial<CreatePrivateLessonData> & { is_active?: boolean } = await request.json();

    // Get community and verify ownership
    const community = await queryOne<Community>`
      SELECT id, created_by
      FROM communities
      WHERE slug = ${communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    // Get the current user from session
    const session = await getSession();

    if (!session || session.user.id !== community.created_by) {
      return NextResponse.json(
        { error: "Unauthorized - only community creators can update private lessons" },
        { status: 403 }
      );
    }

    // Validate update data
    if (updateData.regular_price && updateData.regular_price <= 0) {
      return NextResponse.json(
        { error: "Regular price must be greater than 0" },
        { status: 400 }
      );
    }

    if (updateData.member_price && updateData.regular_price && updateData.member_price > updateData.regular_price) {
      return NextResponse.json(
        { error: "Member price cannot be greater than regular price" },
        { status: 400 }
      );
    }

    // Build dynamic update query
    const lesson = await queryOne<PrivateLesson>`
      UPDATE private_lessons
      SET
        title = COALESCE(${updateData.title ?? null}, title),
        description = COALESCE(${updateData.description ?? null}, description),
        duration_minutes = COALESCE(${updateData.duration_minutes ?? null}, duration_minutes),
        regular_price = COALESCE(${updateData.regular_price ?? null}, regular_price),
        member_price = COALESCE(${updateData.member_price ?? null}, member_price),
        is_active = COALESCE(${updateData.is_active ?? null}, is_active),
        updated_at = NOW()
      WHERE id = ${lessonId}
        AND community_id = ${community.id}
      RETURNING *
    `;

    if (!lesson) {
      return NextResponse.json(
        { error: "Private lesson not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ lesson });
  } catch (error) {
    console.error("Error in PUT /api/community/[communitySlug]/private-lessons/[lessonId]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { communitySlug: string; lessonId: string } }
) {
  try {
    const { communitySlug, lessonId } = params;
    const { is_active } = await request.json();

    // Get community and verify ownership
    const community = await queryOne<Community>`
      SELECT id, created_by
      FROM communities
      WHERE slug = ${communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    // Get the current user from session
    const session = await getSession();

    if (!session || session.user.id !== community.created_by) {
      return NextResponse.json(
        { error: "Unauthorized - only community creators can update private lessons" },
        { status: 403 }
      );
    }

    // Update only the is_active status
    const lesson = await queryOne<PrivateLesson>`
      UPDATE private_lessons
      SET is_active = ${is_active}, updated_at = NOW()
      WHERE id = ${lessonId}
        AND community_id = ${community.id}
      RETURNING *
    `;

    if (!lesson) {
      return NextResponse.json(
        { error: "Private lesson not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ lesson });
  } catch (error) {
    console.error("Error in PATCH /api/community/[communitySlug]/private-lessons/[lessonId]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { communitySlug: string; lessonId: string } }
) {
  try {
    const { communitySlug, lessonId } = params;

    // Get community and verify ownership
    const community = await queryOne<Community>`
      SELECT id, created_by
      FROM communities
      WHERE slug = ${communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    // Get the current user from session
    const session = await getSession();

    if (!session || session.user.id !== community.created_by) {
      return NextResponse.json(
        { error: "Unauthorized - only community creators can delete private lessons" },
        { status: 403 }
      );
    }

    // Check if there are any pending or scheduled bookings
    const bookings = await query<Booking>`
      SELECT id
      FROM lesson_bookings
      WHERE private_lesson_id = ${lessonId}
        AND lesson_status IN ('booked', 'scheduled')
    `;

    if (bookings && bookings.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete lesson with pending or scheduled bookings. Please complete or cancel them first." },
        { status: 400 }
      );
    }

    // Hard delete — the lesson_bookings FK cascades, so any completed /
    // cancelled booking history will go with it. Pending/scheduled bookings
    // are blocked above so this is safe.
    const lesson = await queryOne<PrivateLesson>`
      DELETE FROM private_lessons
      WHERE id = ${lessonId}
        AND community_id = ${community.id}
      RETURNING *
    `;

    if (!lesson) {
      return NextResponse.json(
        { error: "Private lesson not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "Private lesson deleted successfully" });
  } catch (error) {
    console.error("Error in DELETE /api/community/[communitySlug]/private-lessons/[lessonId]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
