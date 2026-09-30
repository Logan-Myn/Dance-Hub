import { queryOne } from "@/lib/db";

export type BookingRole = "teacher" | "student";

/**
 * Returns the caller's role on a private-lesson booking, or null if they are
 * neither the student nor the owner of the community the lesson belongs to.
 * Mirrors the check in /api/bookings/[bookingId]/video-token.
 */
export async function getBookingRole(
  bookingId: string,
  userId: string
): Promise<BookingRole | null> {
  const booking = await queryOne<{ student_id: string; community_created_by: string }>`
    SELECT lb.student_id, c.created_by AS community_created_by
    FROM lesson_bookings lb
    INNER JOIN private_lessons pl ON pl.id = lb.private_lesson_id
    INNER JOIN communities c ON c.id = pl.community_id
    WHERE lb.id = ${bookingId}
  `;
  if (!booking) return null;
  if (booking.community_created_by === userId) return "teacher";
  if (booking.student_id === userId) return "student";
  return null;
}
