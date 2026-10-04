import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { buildIcsEvent, icsFileName } from "@/lib/feed/ics";
import { communityPath } from "@/lib/safe-redirect";

export const dynamic = "force-dynamic";

// A booked private lesson as an .ics file, for the student or the teacher.
export async function GET(request: Request, props: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await props.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await queryOne<{
    id: string; scheduled_at: Date | string | null; student_id: string; title: string; duration_minutes: number;
    created_by: string; slug: string; community_name: string; lesson_status: string; payment_status: string;
  }>`
    SELECT lb.id, lb.scheduled_at, lb.student_id, lb.lesson_status, lb.payment_status,
           pl.title, pl.duration_minutes, c.created_by, c.slug, c.name AS community_name
    FROM lesson_bookings lb
    JOIN private_lessons pl ON pl.id = lb.private_lesson_id
    JOIN communities c ON c.id = lb.community_id
    WHERE lb.id = ${bookingId}
  `;
  const userId = session.user.id;
  if (!row || (row.student_id !== userId && row.created_by !== userId)) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (!row.scheduled_at || row.lesson_status === "canceled" || row.payment_status !== "succeeded") {
    return NextResponse.json({ error: "This lesson isn't booked" }, { status: 409 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const ics = buildIcsEvent({
    uid: `lesson-booking-${row.id}@dance-hub.io`,
    title: `${row.title} (${row.community_name})`,
    description: "Join from the private lessons page when it's time.",
    url: `${origin}${communityPath(row.slug, "/private-lessons")}`,
    start: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    now: new Date(),
  });
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${icsFileName(row.title, row.scheduled_at)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
