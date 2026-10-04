import { query } from "@/lib/db";
import { slotStartUtc } from "@/lib/slot-grouping";
import type { TeacherAvailabilitySlot } from "@/types/private-lessons";
import type { LatePolicy } from "./policy";

export interface OpenSlot {
  id: string;
  teacherId: string;
  startsAt: string;
}

const DAY = 86_400_000;
const iso = (v: Date | string) => new Date(v).toISOString();

/**
 * Bookable times for these teachers over the next `days` days: active slots
 * with no booking that isn't canceled (the book route and the unique slot
 * index refuse those too), starting in the future.
 */
export async function getOpenSlots(communityId: string, teacherIds: string[], now: Date, days = 30): Promise<OpenSlot[]> {
  if (teacherIds.length === 0) return [];
  // Slots are stored by the teacher's date; pad a day each side.
  const from = new Date(now.getTime() - DAY).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + (days + 1) * DAY).toISOString().slice(0, 10);
  const rows = await query<{ id: string; teacher_id: string; availability_date: string; start_time: string; teacher_timezone: string }>`
    SELECT tas.id, tas.teacher_id, tas.availability_date::text AS availability_date, tas.start_time::text AS start_time,
           COALESCE(p.timezone, 'UTC') AS teacher_timezone
    FROM teacher_availability_slots tas
    LEFT JOIN lesson_bookings lb
      ON lb.availability_slot_id = tas.id AND lb.community_id = tas.community_id AND lb.lesson_status <> 'canceled'
    LEFT JOIN profiles p ON p.auth_user_id = tas.teacher_id
    WHERE tas.community_id = ${communityId}
      AND tas.teacher_id = ANY(${teacherIds})
      AND tas.is_active = true
      AND lb.id IS NULL
      AND tas.availability_date >= ${from}::date
      AND tas.availability_date <= ${to}::date
    ORDER BY tas.availability_date, tas.start_time
  `;
  const limit = now.getTime() + days * DAY;
  return rows
    .map((r) => ({
      id: r.id,
      teacherId: r.teacher_id,
      startsAt: slotStartUtc({
        availability_date: r.availability_date,
        start_time: r.start_time.slice(0, 5),
        teacher_timezone: r.teacher_timezone,
      } as TeacherAvailabilitySlot).toISOString(),
    }))
    .filter((s) => {
      const t = new Date(s.startsAt).getTime();
      return t > now.getTime() && t <= limit;
    });
}

export interface ViewerBooking {
  id: string;
  lessonTitle: string;
  startsAt: string;
  durationMinutes: number;
  pricePaid: number;
  status: string;
  teacherNotes: string | null;
  cutoffHours: number;
  latePolicy: LatePolicy;
  locationType: "online" | "in_person" | "both";
}

/** The viewer's own paid lessons in this community (not canceled). */
export async function getViewerBookings(communityId: string, userId: string): Promise<ViewerBooking[]> {
  const rows = await query<{
    id: string; title: string; scheduled_at: Date | string | null; duration_minutes: number; price_paid: string | number;
    lesson_status: string; teacher_notes: string | null; cancellation_cutoff_hours: number; late_refund_policy: LatePolicy;
    location_type: "online" | "in_person" | "both";
  }>`
    SELECT lb.id, pl.title, lb.scheduled_at, pl.duration_minutes, lb.price_paid, lb.lesson_status, lb.teacher_notes,
           pl.cancellation_cutoff_hours, pl.late_refund_policy, pl.location_type
    FROM lesson_bookings lb
    JOIN private_lessons pl ON pl.id = lb.private_lesson_id
    WHERE lb.community_id = ${communityId}
      AND lb.student_id = ${userId}
      AND lb.payment_status = 'succeeded'
      AND lb.lesson_status <> 'canceled'
      AND lb.scheduled_at IS NOT NULL
    ORDER BY lb.scheduled_at DESC
    LIMIT 100
  `;
  return rows.map((r) => ({
    id: r.id,
    lessonTitle: r.title,
    startsAt: iso(r.scheduled_at!),
    durationMinutes: r.duration_minutes,
    pricePaid: Number(r.price_paid),
    status: r.lesson_status,
    teacherNotes: r.teacher_notes,
    cutoffHours: r.cancellation_cutoff_hours,
    latePolicy: r.late_refund_policy,
    locationType: r.location_type,
  }));
}

export interface OwnerBooking {
  id: string;
  lessonId: string;
  lessonTitle: string;
  startsAt: string | null;
  durationMinutes: number;
  pricePaid: number;
  status: string;
  paymentStatus: string;
  studentName: string;
  studentEmail: string;
  studentMessage: string | null;
  phone: string | null;
  isMember: boolean;
  teacherNotes: string | null;
  canceledAt: string | null;
}

/** Every paid booking of the community (and recent cancels), for the owner. */
export async function getOwnerBookings(communityId: string): Promise<OwnerBooking[]> {
  const rows = await query<{
    id: string; private_lesson_id: string; title: string; scheduled_at: Date | string | null; duration_minutes: number;
    price_paid: string | number; lesson_status: string; payment_status: string; student_name: string | null;
    student_email: string; student_message: string | null; contact_info: { phone?: string } | null;
    is_community_member: boolean | null; teacher_notes: string | null; canceled_at: Date | string | null;
  }>`
    SELECT lb.id, lb.private_lesson_id, pl.title, lb.scheduled_at, pl.duration_minutes, lb.price_paid, lb.lesson_status,
           lb.payment_status, lb.student_name, lb.student_email, lb.student_message, lb.contact_info,
           lb.is_community_member, lb.teacher_notes, lb.canceled_at
    FROM lesson_bookings lb
    JOIN private_lessons pl ON pl.id = lb.private_lesson_id
    WHERE lb.community_id = ${communityId}
      AND (lb.payment_status IN ('succeeded', 'refunded'))
    ORDER BY lb.scheduled_at DESC NULLS LAST
    LIMIT 300
  `;
  return rows.map((r) => ({
    id: r.id,
    lessonId: r.private_lesson_id,
    lessonTitle: r.title,
    startsAt: r.scheduled_at ? iso(r.scheduled_at) : null,
    durationMinutes: r.duration_minutes,
    pricePaid: Number(r.price_paid),
    status: r.lesson_status,
    paymentStatus: r.payment_status,
    studentName: r.student_name || r.student_email.split("@")[0],
    studentEmail: r.student_email,
    studentMessage: r.student_message,
    phone: r.contact_info?.phone || null,
    isMember: !!r.is_community_member,
    teacherNotes: r.teacher_notes,
    canceledAt: r.canceled_at ? iso(r.canceled_at) : null,
  }));
}
