import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { generateRoomName, calculateRoomExpiration } from "@/lib/daily";

interface BookingWithLesson {
  id: string;
  payment_status: string;
  daily_room_name: string | null;
  student_id: string;
  lesson_title: string;
  lesson_duration_minutes: number;
  lesson_location_type: string;
  community_slug: string;
  community_created_by: string;
}

export async function GET(request: Request, props: { params: Promise<{ bookingId: string }> }) {
  const params = await props.params;
  try {
    const { bookingId } = params;

    // Get booking details with lesson and community info
    const booking = await queryOne<BookingWithLesson>`
      SELECT
        lb.id,
        lb.payment_status,
        lb.daily_room_name,
        lb.student_id,
        pl.title as lesson_title,
        pl.duration_minutes as lesson_duration_minutes,
        pl.location_type as lesson_location_type,
        c.slug as community_slug,
        c.created_by as community_created_by
      FROM lesson_bookings lb
      INNER JOIN private_lessons pl ON pl.id = lb.private_lesson_id
      INNER JOIN communities c ON c.id = pl.community_id
      WHERE lb.id = ${bookingId}
    `;

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // Generate what would be sent to Daily.co
    const roomName = generateRoomName(booking.id, booking.community_slug);
    const roomExpiration = calculateRoomExpiration(booking.lesson_duration_minutes);

    const roomConfig = {
      name: roomName,
      privacy: 'private' as const,
      properties: {
        max_participants: 2,
        exp: roomExpiration,
        eject_at_room_exp: true,
        enable_chat: true,
        enable_screenshare: true,
        enable_recording: 'cloud' as const,
        start_cloud_recording: false,
        owner_only_broadcast: false,
        enable_knocking: true,
        lang: 'en',
      },
    };

    return NextResponse.json({
      booking: {
        id: booking.id,
        payment_status: booking.payment_status,
        daily_room_name: booking.daily_room_name,
        student_id: booking.student_id,
        private_lessons: {
          title: booking.lesson_title,
          duration_minutes: booking.lesson_duration_minutes,
          location_type: booking.lesson_location_type,
          communities: {
            slug: booking.community_slug,
            created_by: booking.community_created_by
          }
        }
      },
      roomConfig,
      roomName,
      roomExpiration,
      expirationDate: new Date(roomExpiration * 1000).toISOString(),
    });
  } catch (error) {
    console.error("Debug error:", error);
    return NextResponse.json(
      { error: "Debug failed", details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
