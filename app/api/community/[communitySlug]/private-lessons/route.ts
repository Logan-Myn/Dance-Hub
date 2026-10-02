import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
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

export async function GET(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    const { communitySlug } = params;
    const { searchParams } = new URL(request.url);
    const wantsAll = searchParams.get('include_inactive') === 'true';

    // Get community ID from slug (also need created_by to authorize ?include_inactive)
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

    // include_inactive lets the community owner see deactivated lessons in
    // the management modal. Silently ignore the param for non-owners so the
    // public endpoint can't be coaxed into leaking inactive lessons.
    let includeInactive = false;
    if (wantsAll) {
      const session = await getSession();
      includeInactive = !!session && session.user.id === community.created_by;
    }

    const lessons = includeInactive
      ? await query<PrivateLesson>`
          SELECT *
          FROM private_lessons
          WHERE community_id = ${community.id}
          ORDER BY created_at DESC
        `
      : await query<PrivateLesson>`
          SELECT *
          FROM private_lessons
          WHERE community_id = ${community.id}
            AND is_active = true
          ORDER BY created_at DESC
        `;

    return NextResponse.json({ lessons });
  } catch (error) {
    console.error("Error in GET /api/community/[communitySlug]/private-lessons:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    const { communitySlug } = params;
    const lessonData: CreatePrivateLessonData = await request.json();

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

    // Verify the current user is the community creator
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized - Authentication required" },
        { status: 401 }
      );
    }

    const user = session.user;

    if (user.id !== community.created_by) {
      return NextResponse.json(
        { error: "Unauthorized - only community creators can create private lessons" },
        { status: 403 }
      );
    }

    // Validate lesson data
    if (!lessonData.title || !lessonData.duration_minutes || !lessonData.regular_price) {
      return NextResponse.json(
        { error: "Missing required fields: title, duration_minutes, regular_price" },
        { status: 400 }
      );
    }

    const memberPrice = lessonData.member_price ?? null;
    const maxBookings = lessonData.max_bookings_per_month ?? null;
    const locationType = lessonData.location_type ?? 'online';
    const validationError =
      lessonPriceError(lessonData.regular_price, memberPrice) ??
      maxBookingsError(maxBookings) ??
      locationTypeError(locationType);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Create the private lesson — honor the is_active flag from the form
    // (defaulting to true) so a creator can save a draft as deactivated.
    const isActive = (lessonData as { is_active?: boolean }).is_active ?? true;
    const cancellationCutoffHours = lessonData.cancellation_cutoff_hours ?? 24;
    const lateRefundPolicy = lessonData.late_refund_policy ?? 'no_refund';
    const lesson = await queryOne<PrivateLesson>`
      INSERT INTO private_lessons (
        community_id,
        teacher_id,
        title,
        description,
        duration_minutes,
        regular_price,
        member_price,
        location_type,
        max_bookings_per_month,
        requirements,
        is_active,
        cancellation_cutoff_hours,
        late_refund_policy
      ) VALUES (
        ${community.id},
        ${user.id},
        ${lessonData.title},
        ${lessonData.description || null},
        ${lessonData.duration_minutes},
        ${lessonData.regular_price},
        ${memberPrice},
        ${locationType},
        ${maxBookings},
        ${normalizeRequirements(lessonData.requirements)},
        ${isActive},
        ${cancellationCutoffHours},
        ${lateRefundPolicy}
      )
      RETURNING *
    `;

    if (!lesson) {
      console.error("Error creating private lesson: no row returned");
      return NextResponse.json(
        { error: "Failed to create private lesson" },
        { status: 500 }
      );
    }

    return NextResponse.json({ lesson }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/community/[communitySlug]/private-lessons:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
