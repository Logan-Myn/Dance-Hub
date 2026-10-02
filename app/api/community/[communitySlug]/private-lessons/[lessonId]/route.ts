import { NextResponse } from "next/server";
import { query, queryOne, sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { userCanManageCommunity } from "@/lib/community-auth";
import { CreatePrivateLessonData } from "@/types/private-lessons";
import {
  lessonPriceError,
  locationTypeError,
  maxBookingsError,
  normalizeRequirements,
} from "@/lib/private-lesson-validation";

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
  created_at: string;
  updated_at: string;
}

interface Booking {
  id: string;
}

// The saved values a partial update falls back to. Numeric columns come back
// from the database as strings.
interface SavedLessonFields {
  regular_price: number | string;
  member_price: number | string | null;
  max_bookings_per_month: number | null;
  requirements: string | null;
}

/** True when the request body sets this field, even to null. */
function sets(body: object, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, field) &&
    (body as Record<string, unknown>)[field] !== undefined;
}

export async function GET(
  request: Request,
  props: { params: Promise<{ communitySlug: string; lessonId: string }> }
) {
  const params = await props.params;
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

    // Inactive (hidden) lessons are only visible to the owner and platform
    // admins; everyone else gets a 404, as if the lesson did not exist.
    const session = await getSession();
    const canManage =
      !!session && (await userCanManageCommunity(session.user.id, community.id));

    // Get the specific private lesson
    const lesson = canManage
      ? await queryOne<PrivateLesson>`
          SELECT *
          FROM private_lessons
          WHERE id = ${lessonId}
            AND community_id = ${community.id}
        `
      : await queryOne<PrivateLesson>`
          SELECT *
          FROM private_lessons
          WHERE id = ${lessonId}
            AND community_id = ${community.id}
            AND is_active = true
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
  props: { params: Promise<{ communitySlug: string; lessonId: string }> }
) {
  const params = await props.params;
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

    const saved = await queryOne<SavedLessonFields>`
      SELECT regular_price, member_price, max_bookings_per_month, requirements
      FROM private_lessons
      WHERE id = ${lessonId}
        AND community_id = ${community.id}
    `;

    if (!saved) {
      return NextResponse.json(
        { error: "Private lesson not found" },
        { status: 404 }
      );
    }

    // A field missing from the body keeps its saved value; an explicit null
    // clears it (e.g. removing the member discount).
    const regularPrice = sets(updateData, "regular_price")
      ? updateData.regular_price
      : Number(saved.regular_price);
    const memberPrice = sets(updateData, "member_price")
      ? updateData.member_price
      : saved.member_price === null ? null : Number(saved.member_price);
    const maxBookings = sets(updateData, "max_bookings_per_month")
      ? updateData.max_bookings_per_month
      : saved.max_bookings_per_month;
    const requirements = sets(updateData, "requirements")
      ? normalizeRequirements(updateData.requirements)
      : saved.requirements;

    const validationError =
      lessonPriceError(regularPrice, memberPrice) ??
      maxBookingsError(maxBookings) ??
      (sets(updateData, "location_type") ? locationTypeError(updateData.location_type) : null);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const lesson = await queryOne<PrivateLesson>`
      UPDATE private_lessons
      SET
        title = COALESCE(${updateData.title ?? null}, title),
        description = COALESCE(${updateData.description ?? null}, description),
        duration_minutes = COALESCE(${updateData.duration_minutes ?? null}, duration_minutes),
        regular_price = ${regularPrice},
        member_price = ${memberPrice},
        location_type = COALESCE(${updateData.location_type ?? null}, location_type),
        max_bookings_per_month = ${maxBookings},
        requirements = ${requirements},
        is_active = COALESCE(${updateData.is_active ?? null}, is_active),
        cancellation_cutoff_hours = COALESCE(${updateData.cancellation_cutoff_hours ?? null}, cancellation_cutoff_hours),
        late_refund_policy = COALESCE(${updateData.late_refund_policy ?? null}, late_refund_policy),
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
  props: { params: Promise<{ communitySlug: string; lessonId: string }> }
) {
  const params = await props.params;
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
  props: { params: Promise<{ communitySlug: string; lessonId: string }> }
) {
  const params = await props.params;
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
