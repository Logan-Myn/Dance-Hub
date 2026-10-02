// Platform fee on a private-lesson payment. It follows the rules the landing
// page advertises for a community's revenue (app/HomePageClient.tsx): 0% for
// the community's first 30 days, then 8% under 50 members, 6% from 50 to 100
// members and 4% above 100. The inputs are the ones membership fees are
// computed from: the community's created_at and active_member_count.

const PROMOTIONAL_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export interface FeeCommunity {
  created_at: string | Date;
  active_member_count: number | string | null;
}

export function privateLessonFeePercentage(
  community: FeeCommunity,
  now: Date = new Date(),
): number {
  const age = now.getTime() - new Date(community.created_at).getTime();
  if (age < PROMOTIONAL_PERIOD_MS) return 0;

  const members = Number(community.active_member_count ?? 0);
  if (members < 50) return 8;
  if (members <= 100) return 6;
  return 4;
}
