/** A new session starts when the last feed visit is at least this old. */
export const SESSION_GAP_MS = 30 * 60 * 1000;

type Instant = Date | string | null | undefined;

const ms = (v: Instant): number | null => {
  if (v == null) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * The moment posts are "new" after. At render time the visit route hasn't
 * run yet: a last visit from an earlier session is the baseline; inside the
 * same session the previous visit stays the baseline, so dots don't vanish
 * on refresh. Null (first visit) means no dots.
 */
export function feedVisitBaseline(lastVisit: Instant, prevVisit: Instant, now: Date): string | null {
  const last = ms(lastVisit);
  if (last === null) return null;
  if (now.getTime() - last >= SESSION_GAP_MS) return new Date(last).toISOString();
  const prev = ms(prevVisit);
  return prev === null ? null : new Date(prev).toISOString();
}

/** A post is new when someone else wrote it after the baseline. */
export function isNewPost(
  post: { createdAt: string; userId: string },
  baseline: string | null,
  viewerId: string
): boolean {
  if (!baseline || post.userId === viewerId) return false;
  const created = ms(post.createdAt);
  const base = ms(baseline);
  return created !== null && base !== null && created > base;
}
