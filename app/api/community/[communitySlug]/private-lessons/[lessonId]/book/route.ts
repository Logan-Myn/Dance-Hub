import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { getSession } from "@/lib/auth-session";
import { naiveToUtc } from "@/lib/timezone";
import { CreateLessonBookingData } from "@/types/private-lessons";

interface Community {
  id: string;
  name: string;
  stripe_account_id: string | null;
  created_by: string;
}

interface Lesson {
  id: string;
  title: string;
  teacher_id: string | null;
  regular_price: number;
  member_price: number | null;
  is_active: boolean;
}

interface Membership {
  id: string;
}

// Availability slot as the student saw it: a date and time in the teacher's
// timezone. The lesson time is derived from it, never taken from the client.
interface BookableSlot {
  id: string;
  availability_date: string;
  start_time: string;
  teacher_timezone: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  props: { params: Promise<{ communitySlug: string; lessonId: string }> }
) {
  const params = await props.params;
  try {
    const { communitySlug, lessonId } = params;
    const bookingData: CreateLessonBookingData = await request.json();

    // Get the current user from Better Auth session
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const user = session.user;

    // Get community with Stripe account info
    const community = await queryOne<Community>`
      SELECT id, name, stripe_account_id, created_by
      FROM communities
      WHERE slug = ${communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    if (!community.stripe_account_id) {
      return NextResponse.json(
        { error: "Community payment processing not set up" },
        { status: 400 }
      );
    }

    // Get the private lesson
    const lesson = await queryOne<Lesson>`
      SELECT id, title, teacher_id, regular_price, member_price, is_active
      FROM private_lessons
      WHERE id = ${lessonId}
        AND community_id = ${community.id}
        AND is_active = true
    `;

    if (!lesson) {
      return NextResponse.json(
        { error: "Private lesson not found or not available" },
        { status: 404 }
      );
    }

    // Check if user is a community member
    const membership = await queryOne<Membership>`
      SELECT id
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id = ${user.id}
        AND status = 'active'
    `;

    const isMember = !!membership;
    const price = isMember && lesson.member_price ? lesson.member_price : lesson.regular_price;

    // Validate booking data
    if (!bookingData.student_email) {
      return NextResponse.json(
        { error: "Student email is required" },
        { status: 400 }
      );
    }

    const slotId = bookingData.availability_slot_id;
    if (typeof slotId !== "string" || !UUID_RE.test(slotId)) {
      return NextResponse.json(
        { error: "Please select a time slot" },
        { status: 400 }
      );
    }

    // The slot must be one of this lesson's teacher's open slots in this
    // community; slot ids are visible to anyone who can see availability.
    const slot = await queryOne<BookableSlot>`
      SELECT
        tas.id,
        to_char(tas.availability_date, 'YYYY-MM-DD') AS availability_date,
        to_char(tas.start_time, 'HH24:MI:SS') AS start_time,
        COALESCE(p.timezone, 'UTC') AS teacher_timezone
      FROM teacher_availability_slots tas
      LEFT JOIN profiles p ON p.auth_user_id = tas.teacher_id
      WHERE tas.id = ${slotId}
        AND tas.community_id = ${community.id}
        AND tas.teacher_id = ${lesson.teacher_id}
        AND tas.is_active = true
    `;

    if (!slot) {
      return NextResponse.json(
        { error: "This time slot is not available. Please pick another time." },
        { status: 404 }
      );
    }

    // Same conversion the slot picker uses to show the time to the student.
    const scheduledAt = naiveToUtc(
      `${slot.availability_date}T${slot.start_time}`,
      slot.teacher_timezone
    );
    if (scheduledAt.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "This time slot has already passed. Please pick another time." },
        { status: 400 }
      );
    }

    // A canceled booking frees its slot (lesson_bookings_active_slot_key is
    // the database-side guarantee; this check gives a clear error early).
    const taken = await queryOne<{ id: string }>`
      SELECT id
      FROM lesson_bookings
      WHERE availability_slot_id = ${slot.id}
        AND lesson_status <> 'canceled'
      LIMIT 1
    `;
    if (taken) {
      return NextResponse.json(
        { error: "This time slot was just booked. Please pick another time." },
        { status: 409 }
      );
    }

    // Store booking data in PaymentIntent metadata for webhook processing
    const privateLessonFeePercentage = 5.0; // 5% platform fee for private lessons

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: Math.round(price * 100), // Convert to cents
        currency: "eur",
        application_fee_amount: Math.round((price * privateLessonFeePercentage / 100) * 100), // 5% platform fee in cents
        metadata: {
          type: "private_lesson",
          lesson_id: lessonId,
          community_id: community.id,
          student_id: user.id,
          student_email: bookingData.student_email,
          student_name: bookingData.student_name || "",
          student_message: bookingData.student_message || "",
          contact_info: JSON.stringify(bookingData.contact_info || {}),
          scheduled_at: scheduledAt.toISOString(),
          availability_slot_id: slot.id,
          is_member: isMember.toString(),
          price_paid: price.toString(),
          platform_fee_percentage: privateLessonFeePercentage.toString(),
          platform_fee_amount: (price * privateLessonFeePercentage / 100).toString(),
        },
        description: `Private Lesson: ${lesson.title} - ${community.name}`,
        receipt_email: bookingData.student_email,
      },
      {
        stripeAccount: community.stripe_account_id,
      }
    );

    // Return only payment information - no booking created yet!
    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      stripeAccountId: community.stripe_account_id,
      paymentIntentId: paymentIntent.id,
      lesson: {
        title: lesson.title,
        price: price,
        isMember: isMember
      }
    });
  } catch (error) {
    console.error("Error in POST /api/community/[communitySlug]/private-lessons/[lessonId]/book:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
