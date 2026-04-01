import { NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { createRoom, generateToken } from "@/lib/stream-hub";

interface BookingWithLesson {
  id: string;
  student_id: string;
  payment_status: string;
  livekit_room_name: string | null;
  scheduled_at: string | null;
  lesson_title: string;
  lesson_duration_minutes: number;
  community_created_by: string;
}

export async function POST(
  request: Request,
  { params }: { params: { bookingId: string } }
) {
  try {
    const { bookingId } = params;

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const user = session.user;

    const booking = await queryOne<BookingWithLesson>`
      SELECT
        lb.id,
        lb.student_id,
        lb.payment_status,
        lb.livekit_room_name,
        lb.scheduled_at,
        pl.title as lesson_title,
        pl.duration_minutes as lesson_duration_minutes,
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

    if (booking.payment_status !== "succeeded") {
      return NextResponse.json({ error: "Payment must be completed before generating video tokens" }, { status: 400 });
    }

    // Create room if needed (idempotent)
    const roomName = `booking-${bookingId}`;
    if (!booking.livekit_room_name) {
      await createRoom(roomName, 2);
      await sql`
        UPDATE lesson_bookings SET livekit_room_name = ${roomName}
        WHERE id = ${bookingId}
      `;
    }

    // Generate token
    const role = isTeacher ? "admin" : "participant";
    const userName = isTeacher ? "Teacher" : "Student";
    const tokenData = await generateToken(booking.livekit_room_name || roomName, userName, role);

    return NextResponse.json({
      token: tokenData.token,
      serverUrl: tokenData.serverUrl,
      lesson_title: booking.lesson_title,
      duration_minutes: booking.lesson_duration_minutes,
      is_teacher: isTeacher,
    });
  } catch (error) {
    console.error("Error in POST /api/bookings/[bookingId]/video-token:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
