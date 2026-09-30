import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { getBookingRole } from "@/lib/booking-participant";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { bookingId } = await request.json();
    if (!bookingId) {
      return NextResponse.json({ error: "Missing booking ID" }, { status: 400 });
    }

    // Role comes from the booking, not the request body.
    const role = await getBookingRole(bookingId, session.user.id);
    if (!role) {
      return NextResponse.json({ error: "Not authorized for this booking" }, { status: 403 });
    }

    if (role === "teacher") {
      await sql`
        UPDATE lesson_bookings
        SET teacher_joined_at = NOW(),
            session_started_at = COALESCE(session_started_at, NOW()),
            updated_at = NOW()
        WHERE id = ${bookingId}
      `;
    } else {
      await sql`
        UPDATE lesson_bookings
        SET student_joined_at = NOW(),
            session_started_at = COALESCE(session_started_at, NOW()),
            updated_at = NOW()
        WHERE id = ${bookingId}
      `;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error starting video session:", error);
    return NextResponse.json({ error: "Failed to start session" }, { status: 500 });
  }
}
