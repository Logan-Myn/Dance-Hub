import { queryOne } from '@/lib/db';
import {
  getCalendarMonthRange,
  getMonthlyRevenue,
  getRevenueChart6Months,
  computeMoMGrowth,
} from '@/lib/admin-dashboard/stats';
import type { RevenuePoint } from '@/lib/admin-dashboard/types';

export interface CommunitySnapshot {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  isPaid: boolean;
  // KPIs
  monthlyRevenue: number;
  revenueGrowth: number;
  membersTotal: number;
  newMembersThisMonth: number;
  newMembersGrowth: number;
  cancellationsThisMonth: number;
  cancellationsLastMonth: number;
  // Chart series
  revenueChart6Months: RevenuePoint[];
}

interface CommunityRow {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  membership_enabled: boolean;
  stripe_account_id: string | null;
  created_by: string;
}

interface CountRow {
  count: number;
}

// Reuses lib/admin-dashboard/* helpers so the numbers shown here match
// what the community owner sees on their own admin page.
export async function getCommunitySnapshot(
  communityId: string,
  now: Date = new Date()
): Promise<CommunitySnapshot | null> {
  const community = await queryOne<CommunityRow>`
    SELECT id, name, slug, image_url, membership_enabled, stripe_account_id, created_by
    FROM communities
    WHERE id = ${communityId}
  `;
  if (!community) return null;

  const thisMonth = getCalendarMonthRange(now, 0);
  const lastMonth = getCalendarMonthRange(now, -1);

  const [
    membersTotalRow,
    newMembersThisMonthRow,
    newMembersLastMonthRow,
    cancellationsThisMonthRow,
    cancellationsLastMonthRow,
    revenue,
    revenueChart,
  ] = await Promise.all([
    queryOne<CountRow>`
      SELECT COUNT(*) FILTER (WHERE status='active')::int AS count
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id != ${community.created_by}
    `,
    queryOne<CountRow>`
      SELECT COUNT(*)::int AS count
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id != ${community.created_by}
        AND joined_at >= ${thisMonth.start.toISOString()}
        AND joined_at < ${thisMonth.end.toISOString()}
    `,
    queryOne<CountRow>`
      SELECT COUNT(*)::int AS count
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id != ${community.created_by}
        AND joined_at >= ${lastMonth.start.toISOString()}
        AND joined_at < ${lastMonth.end.toISOString()}
    `,
    queryOne<CountRow>`
      SELECT COUNT(*)::int AS count
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id != ${community.created_by}
        AND status IN ('inactive','cancelled')
        AND cancelled_at >= ${thisMonth.start.toISOString()}
        AND cancelled_at < ${thisMonth.end.toISOString()}
    `,
    queryOne<CountRow>`
      SELECT COUNT(*)::int AS count
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id != ${community.created_by}
        AND status IN ('inactive','cancelled')
        AND cancelled_at >= ${lastMonth.start.toISOString()}
        AND cancelled_at < ${lastMonth.end.toISOString()}
    `,
    getMonthlyRevenue(community.stripe_account_id, now),
    getRevenueChart6Months(community.stripe_account_id, now),
  ]);

  const newMembersThisMonth = newMembersThisMonthRow?.count ?? 0;
  const newMembersLastMonth = newMembersLastMonthRow?.count ?? 0;

  return {
    id: community.id,
    name: community.name,
    slug: community.slug,
    imageUrl: community.image_url,
    isPaid: community.membership_enabled,
    monthlyRevenue: revenue.monthlyRevenue,
    revenueGrowth: revenue.revenueGrowth,
    membersTotal: membersTotalRow?.count ?? 0,
    newMembersThisMonth,
    newMembersGrowth: computeMoMGrowth(newMembersThisMonth, newMembersLastMonth),
    cancellationsThisMonth: cancellationsThisMonthRow?.count ?? 0,
    cancellationsLastMonth: cancellationsLastMonthRow?.count ?? 0,
    revenueChart6Months: revenueChart,
  };
}
