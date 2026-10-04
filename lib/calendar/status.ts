export type ClassState = "upcoming" | "soon" | "live" | "past" | "canceled";

const SOON_MS = 15 * 60_000;

/** What a class is right now, from its stored status and the clock. */
export function classState(
  c: { status: string; startsAt: string; durationMinutes: number },
  now: Date
): ClassState {
  if (c.status === "cancelled") return "canceled";
  if (c.status === "live") return "live";
  if (c.status === "ended") return "past";
  const start = new Date(c.startsAt).getTime();
  const end = start + c.durationMinutes * 60_000;
  const t = now.getTime();
  if (t >= end) return "past";
  if (t >= start) return "live";
  if (start - t <= SOON_MS) return "soon";
  return "upcoming";
}

/** A private lesson's video room is open from 15 minutes before to 15 after. */
export function lessonJoinable(startsAt: string, durationMinutes: number, now: Date): boolean {
  const start = new Date(startsAt).getTime();
  const end = start + durationMinutes * 60_000;
  return now.getTime() >= start - 15 * 60_000 && now.getTime() <= end + 15 * 60_000;
}
