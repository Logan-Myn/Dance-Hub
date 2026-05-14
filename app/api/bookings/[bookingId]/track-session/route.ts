import { NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";

interface BookingWithAccess {
  id: string;
  student_id: string;
  session_started_at: string | null;
  community_created_by: string;
}

type TrackAction = 'join' | 'leave' | 'session_start' | 'session_end';

export async function POST(request: Request, props: { params: Promise<{ bookingId: string }> }) {
  const params = await props.params;
  try {
    const { bookingId } = params;
    const { action } = (await request.json()) as { action?: TrackAction };

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const user = session.user;

    const booking = await queryOne<BookingWithAccess>`
      SELECT
        lb.id,
        lb.student_id,
        lb.session_started_at,
        c.created_by as community_created_by
      FROM lesson_bookings lb
      INNER JOIN private_lessons pl ON pl.id = lb.private_lesson_id
      INNER JOIN communities c ON c.id = pl.community_id
      WHERE lb.id = ${bookingId}
    `;

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const isStudent = booking.student_id === user.id;
    const isTeacher = booking.community_created_by === user.id;

    if (!isStudent && !isTeacher) {
      return NextResponse.json({ error: "Not authorized to access this booking" }, { status: 403 });
    }

    const now = new Date().toISOString();

    if (action === 'join') {
      const markSessionStarted = !booking.session_started_at;
      if (isStudent) {
        if (markSessionStarted) {
          await sql`UPDATE lesson_bookings SET student_joined_at = ${now}, session_started_at = ${now} WHERE id = ${bookingId}`;
        } else {
          await sql`UPDATE lesson_bookings SET student_joined_at = ${now} WHERE id = ${bookingId}`;
        }
      } else {
        if (markSessionStarted) {
          await sql`UPDATE lesson_bookings SET teacher_joined_at = ${now}, session_started_at = ${now} WHERE id = ${bookingId}`;
        } else {
          await sql`UPDATE lesson_bookings SET teacher_joined_at = ${now} WHERE id = ${bookingId}`;
        }
      }
    } else if (action === 'leave') {
      if (isStudent) {
        await sql`UPDATE lesson_bookings SET student_joined_at = NULL WHERE id = ${bookingId}`;
      } else {
        await sql`UPDATE lesson_bookings SET teacher_joined_at = NULL WHERE id = ${bookingId}`;
      }
    } else if (action === 'session_start') {
      await sql`UPDATE lesson_bookings SET session_started_at = ${now} WHERE id = ${bookingId}`;
    } else if (action === 'session_end') {
      await sql`UPDATE lesson_bookings SET session_ended_at = ${now} WHERE id = ${bookingId}`;
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in POST /api/bookings/[bookingId]/track-session:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
