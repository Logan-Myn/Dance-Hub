import { NextResponse } from "next/server";
import { query } from "@/lib/db";
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
  daily_room_name: string | null;
  daily_room_url: string | null;
  daily_room_expires_at: string | null;
  session_started_at: string | null;
  session_ended_at: string | null;
  teacher_notes: string | null;
  created_at: string;
  updated_at: string;
  lesson_title: string;
  lesson_description: string | null;
  duration_minutes: number;
  regular_price: number;
  member_price: number | null;
  location_type: string;
  community_name: string;
  community_slug: string;
}

// GET: Fetch all bookings for the current user (as student)
export async function GET() {
  try {
    // Get the current user from Better Auth session
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const user = session.user;

    const bookings = await query<BookingWithDetails>`
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
        lb.daily_room_name,
        lb.daily_room_url,
        lb.daily_room_expires_at,
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
        c.slug as community_slug
      FROM lesson_bookings lb
      INNER JOIN private_lessons pl ON pl.id = lb.private_lesson_id
      INNER JOIN communities c ON c.id = pl.community_id
      WHERE lb.student_id = ${user.id}
      ORDER BY lb.created_at DESC
      LIMIT 100
    `;

    return NextResponse.json(bookings || []);
  } catch (error) {
    console.error("Error in GET /api/bookings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
