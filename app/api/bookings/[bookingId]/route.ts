import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth-session";

interface BookingWithDetails {
  id: string;
  private_lesson_id: string;
  student_id: string;
  student_email: string;
  student_name: string | null;
  student_message: string | null;
  contact_info: any;
  scheduled_at: string | null;
  lesson_status: string;
  payment_status: string;
  payment_intent_id: string | null;
  price_paid: number;
  is_community_member: boolean;
  session_started_at: string | null;
  session_ended_at: string | null;
  teacher_notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  lesson_title: string;
  lesson_description: string | null;
  duration_minutes: number;
  regular_price: number;
  member_price: number | null;
  location_type: string;
  community_name: string;
  community_slug: string;
  community_created_by: string;
}

export async function GET(request: Request, props: { params: Promise<{ bookingId: string }> }) {
  const params = await props.params;
  try {
    const { bookingId } = params;

    // Get the current user from Better Auth session
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const user = session.user;

    // Get booking with lesson and community details
    const booking = await queryOne<BookingWithDetails>`
      SELECT
        lb.id,
        lb.private_lesson_id,
        lb.student_id,
        lb.student_email,
        lb.student_name,
        lb.student_message,
        lb.contact_info,
        lb.scheduled_at,
        lb.lesson_status,
        lb.payment_status,
        lb.stripe_payment_intent_id as payment_intent_id,
        lb.price_paid,
        lb.is_community_member,
        lb.livekit_room_name,
        lb.session_started_at,
        lb.session_ended_at,
        lb.teacher_notes,
        lb.created_at,
        lb.updated_at,
        pl.title as lesson_title,
        pl.description as lesson_description,
        pl.duration_minutes,
        pl.regular_price,
        pl.member_price,
        pl.location_type,
        c.name as community_name,
        c.slug as community_slug,
        c.created_by as community_created_by
      FROM lesson_bookings lb
      INNER JOIN private_lessons pl ON pl.id = lb.private_lesson_id
      INNER JOIN communities c ON c.id = pl.community_id
      WHERE lb.id = ${bookingId}
    `;

    if (!booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    // Check if user is authorized (student or teacher)
    const isStudent = booking.student_id === user.id;
    const isTeacher = booking.community_created_by === user.id;

    if (!isStudent && !isTeacher) {
      return NextResponse.json(
        { error: "Not authorized to access this booking" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      ...booking,
      is_teacher: isTeacher,
    });
  } catch (error) {
    console.error("Error in GET /api/bookings/[bookingId]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

const MAX_NOTES = 5000;

/**
 * The teacher's notes on a booking (what you worked on, what to practice).
 * Only the community owner can write them; the student reads them on the
 * private lessons page.
 */
export async function PATCH(request: Request, props: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await props.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const notes = body?.teacher_notes;
  if (notes !== null && typeof notes !== "string") {
    return NextResponse.json({ error: "Invalid notes" }, { status: 400 });
  }
  if (typeof notes === "string" && notes.length > MAX_NOTES) {
    return NextResponse.json({ error: "Notes are too long" }, { status: 400 });
  }

  try {
  const owner = await queryOne<{ created_by: string }>`
    SELECT c.created_by
    FROM lesson_bookings lb
    JOIN communities c ON c.id = lb.community_id
    WHERE lb.id = ${bookingId}
  `;
  if (!owner) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (owner.created_by !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const saved = await queryOne<{ teacher_notes: string | null }>`
    UPDATE lesson_bookings
    SET teacher_notes = ${typeof notes === "string" && notes.trim() ? notes.trim() : null}, updated_at = NOW()
    WHERE id = ${bookingId}
    RETURNING teacher_notes
  `;
  return NextResponse.json({ teacher_notes: saved?.teacher_notes ?? null });
  } catch (error) {
    console.error("Error saving teacher notes:", error);
    return NextResponse.json({ error: "Couldn't save the notes" }, { status: 500 });
  }
}
