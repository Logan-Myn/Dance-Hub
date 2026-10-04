// Cancellation rules for private lessons. Mirrors
// app/api/bookings/[bookingId]/cancel/route.ts: the teacher always refunds in
// full; a student is refunded before the cutoff, or any time when the late
// policy is "refund"; nobody can cancel once the lesson has started.

export type LatePolicy = "refund" | "no_refund";

const hoursText = (h: number) => (h === 1 ? "1 hour" : `${h} hours`);

/** One line for the lesson card and the booking dialog. */
export function describeCancellationPolicy(cutoffHours: number, latePolicy: LatePolicy): string {
  if (latePolicy === "refund" || cutoffHours <= 0) return "Free cancellation until the lesson starts.";
  const w = hoursText(cutoffHours);
  return `Free cancellation up to ${w} before. No refund within ${w}.`;
}

/** Whether the lesson can still be canceled (it hasn't started). */
export function canCancel(scheduledAt: string | null, now: Date): boolean {
  return !scheduledAt || now.getTime() < new Date(scheduledAt).getTime();
}

/** What a cancel would refund, in euros. */
export function refundOnCancel(opts: {
  pricePaid: number;
  scheduledAt: string | null;
  cutoffHours: number;
  latePolicy: LatePolicy;
  role: "student" | "teacher";
  now: Date;
}): number {
  const { pricePaid, scheduledAt, cutoffHours, latePolicy, role, now } = opts;
  if (role === "teacher" || !scheduledAt) return pricePaid;
  const cutoff = new Date(scheduledAt).getTime() - cutoffHours * 3_600_000;
  return now.getTime() <= cutoff || latePolicy === "refund" ? pricePaid : 0;
}

/** "Free cancellation until Sat 18 Oct, 19:00" style deadline, or null when there is none. */
export function freeCancelUntil(scheduledAt: string, cutoffHours: number, latePolicy: LatePolicy): Date | null {
  if (latePolicy === "refund") return null;
  return new Date(new Date(scheduledAt).getTime() - Math.max(0, cutoffHours) * 3_600_000);
}

export const euro = (n: number) => `€${Number.isInteger(n) ? n : n.toFixed(2)}`;
