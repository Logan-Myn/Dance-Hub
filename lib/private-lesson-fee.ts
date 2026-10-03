// Platform fee on a private-lesson payment. It follows the same advertised
// rule as membership payments (see lib/platform-fees.ts, the single source):
// 0% for the community's first 15 days, then 8% under 50 members, 6% from 50
// to 100 members and 4% above 100.

import { membershipFeePercentage } from '@/lib/platform-fees';

/**
 * The advertised platform fee, in percent, for a community of this age and
 * size at `now`.
 */
export function platformFeePercent({
  communityCreatedAt,
  activeMemberCount,
  now,
}: {
  communityCreatedAt: string | Date;
  activeMemberCount: number | string | null;
  now: Date;
}): number {
  return membershipFeePercentage(
    {
      created_at: communityCreatedAt,
      active_member_count: activeMemberCount == null ? null : Number(activeMemberCount),
    },
    now.getTime()
  );
}

export interface FeeCommunity {
  created_at: string | Date;
  active_member_count: number | string | null;
}

export function privateLessonFeePercentage(
  community: FeeCommunity,
  now: Date = new Date(),
): number {
  return platformFeePercent({
    communityCreatedAt: community.created_at,
    activeMemberCount: community.active_member_count,
    now,
  });
}
