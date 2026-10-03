// Platform fee on membership payments, as the landing page advertises it:
// 0% for a community's first 15 days, then 8% under 50 members, 6% from 50 to
// 100, and 4% above 100. Used by join-paid, join-pre-registration and the
// Stripe webhook, so the rule lives in one place.

/** Length of the 0% launch promo, counted from the community's creation. */
export const LAUNCH_PROMO_DAYS = 15;
const LAUNCH_PROMO_MS = LAUNCH_PROMO_DAYS * 24 * 60 * 60 * 1000;

/** True during the community's first 15 days (0% platform fee). */
export function isInLaunchPromo(createdAt: string | Date, now: number = Date.now()): boolean {
  return now - new Date(createdAt).getTime() < LAUNCH_PROMO_MS;
}

/** Fee percentage for a membership payment in this community today. */
export function membershipFeePercentage(
  community: { created_at: string | Date; active_member_count: number | null },
  now: number = Date.now()
): number {
  if (isInLaunchPromo(community.created_at, now)) return 0;
  const members = community.active_member_count ?? 0;
  if (members < 50) return 8;
  if (members <= 100) return 6;
  return 4;
}
