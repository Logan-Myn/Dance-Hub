import { queryOne, query } from '@/lib/db';
import {
  getCalendarMonthRange,
  getMonthlyRevenue,
  getRevenueChart6Months,
  buildMemberGrowthSeries,
  computeMoMGrowth,
} from '@/lib/admin-dashboard/stats';
import {
  mergeActivityEvents,
  getRecentFailedPayments,
} from '@/lib/admin-dashboard/activity-feed';
import type { ActivityEvent } from '@/lib/admin-dashboard/types';
import { DashboardKpis } from '@/components/admin/DashboardKpis';
import { DashboardChart } from '@/components/admin/DashboardChart';
import { DashboardActivityFeed } from '@/components/admin/DashboardActivityFeed';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type CommunityRow = {
  id: string;
  created_by: string;
  membership_enabled: boolean;
  stripe_account_id: string | null;
};

type MembersCounts = { total: number; paying: number };
type CountRow = { count: number };
type JoinEvent = { user_id: string; display_name: string | null; avatar_url: string | null; joined_at: Date };
type CancelEvent = { user_id: string; display_name: string | null; avatar_url: string | null; cancelled_at: Date };
type PostEvent = { id: string; user_id: string; author_name: string | null; author_image: string | null; category_name: string | null; created_at: Date };

export default async function AdminDashboardPage({
  params,
}: {
  params: { communitySlug: string };
}) {
  const community = await queryOne<CommunityRow>`
    SELECT id, created_by, membership_enabled, stripe_account_id
    FROM communities
    WHERE slug = ${params.communitySlug}
  `;
  if (!community) return null;

  const now = new Date();
  const thisMonth = getCalendarMonthRange(now, 0);
  const lastMonth = getCalendarMonthRange(now, -1);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const [
    membersCountsRow,
    newMembersThisMonthRow,
    newMembersLastMonthRow,
    cancellationsThisMonthRow,
    cancellationsLastMonthRow,
    threadsRow,
    commentsRow,
    revenue,
    revenueChart,
    joinsLast90,
    cancelsLast90,
    recentJoinEvents,
    recentCancelEvents,
    recentPostEvents,
    failedPayments,
  ] = await Promise.all([
    queryOne<MembersCounts>`
      SELECT
        COUNT(*) FILTER (WHERE status='active')::int AS total,
        COUNT(*) FILTER (WHERE status='active' AND stripe_subscription_id IS NOT NULL)::int AS paying
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
    queryOne<CountRow>`
      SELECT COUNT(*)::int AS count
      FROM threads
      WHERE community_id = ${community.id}
        AND created_at >= ${thisMonth.start.toISOString()}
        AND created_at < ${thisMonth.end.toISOString()}
    `,
    queryOne<CountRow>`
      SELECT COUNT(*)::int AS count
      FROM comments c
      JOIN threads t ON c.thread_id = t.id
      WHERE t.community_id = ${community.id}
        AND c.created_at >= ${thisMonth.start.toISOString()}
        AND c.created_at < ${thisMonth.end.toISOString()}
    `,
    getMonthlyRevenue(community.stripe_account_id, now),
    getRevenueChart6Months(community.stripe_account_id, now),
    query<{ joined_at: Date }>`
      SELECT joined_at
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id != ${community.created_by}
        AND joined_at >= ${ninetyDaysAgo.toISOString()}
    `,
    query<{ cancelled_at: Date }>`
      SELECT cancelled_at
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id != ${community.created_by}
        AND status IN ('inactive','cancelled')
        AND cancelled_at >= ${ninetyDaysAgo.toISOString()}
    `,
    query<JoinEvent>`
      SELECT
        cm.user_id,
        COALESCE(p.display_name, p.full_name, 'Anonymous') AS display_name,
        p.avatar_url,
        cm.joined_at
      FROM community_members cm
      LEFT JOIN profiles p ON cm.user_id = p.id
      WHERE cm.community_id = ${community.id}
        AND cm.user_id != ${community.created_by}
      ORDER BY cm.joined_at DESC
      LIMIT 10
    `,
    query<CancelEvent>`
      SELECT
        cm.user_id,
        COALESCE(p.display_name, p.full_name, 'Anonymous') AS display_name,
        p.avatar_url,
        cm.cancelled_at
      FROM community_members cm
      LEFT JOIN profiles p ON cm.user_id = p.id
      WHERE cm.community_id = ${community.id}
        AND cm.user_id != ${community.created_by}
        AND cm.status IN ('inactive','cancelled')
        AND cm.cancelled_at IS NOT NULL
      ORDER BY cm.cancelled_at DESC
      LIMIT 10
    `,
    query<PostEvent>`
      SELECT id, user_id, author_name, author_image, category_name, created_at
      FROM threads
      WHERE community_id = ${community.id}
      ORDER BY created_at DESC
      LIMIT 10
    `,
    getRecentFailedPayments(community.stripe_account_id, now),
  ]);

  const membersTotal = membersCountsRow?.total ?? 0;
  const membersPaying = membersCountsRow?.paying ?? 0;
  const newMembersThisMonth = newMembersThisMonthRow?.count ?? 0;
  const newMembersLastMonth = newMembersLastMonthRow?.count ?? 0;
  const cancellationsThisMonth = cancellationsThisMonthRow?.count ?? 0;
  const cancellationsLastMonth = cancellationsLastMonthRow?.count ?? 0;
  const threadsThisMonth = threadsRow?.count ?? 0;
  const commentsThisMonth = commentsRow?.count ?? 0;

  const stats = {
    isPaid: community.membership_enabled,
    monthlyRevenue: revenue.monthlyRevenue,
    revenueGrowth: revenue.revenueGrowth,
    membersTotal,
    membersPaying,
    newMembersThisMonth,
    newMembersGrowth: computeMoMGrowth(newMembersThisMonth, newMembersLastMonth),
    cancellationsThisMonth,
    cancellationsLastMonth,
    postsThreadsThisMonth: threadsThisMonth,
    postsCommentsThisMonth: commentsThisMonth,
  };

  const growth = buildMemberGrowthSeries({
    now,
    currentActiveCount: membersTotal,
    joins: joinsLast90.map((r) => ({ at: new Date(r.joined_at) })),
    cancellations: cancelsLast90.map((r) => ({ at: new Date(r.cancelled_at) })),
  });

  const joins: ActivityEvent[] = recentJoinEvents.map((r) => ({
    type: 'join',
    at: new Date(r.joined_at),
    userId: r.user_id,
    displayName: r.display_name ?? 'Anonymous',
    avatarUrl: r.avatar_url,
  }));
  const cancels: ActivityEvent[] = recentCancelEvents.map((r) => ({
    type: 'cancel',
    at: new Date(r.cancelled_at),
    userId: r.user_id,
    displayName: r.display_name ?? 'Anonymous',
    avatarUrl: r.avatar_url,
  }));
  const posts: ActivityEvent[] = recentPostEvents.map((r) => ({
    type: 'post',
    at: new Date(r.created_at),
    userId: r.user_id,
    displayName: r.author_name ?? 'Anonymous',
    avatarUrl: r.author_image,
    threadId: r.id,
    categoryName: r.category_name,
  }));

  const events = mergeActivityEvents([joins, cancels, posts, failedPayments], 10);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500 space-y-8">
      <header>
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">
          Dashboard
        </h1>
      </header>

      <DashboardKpis stats={stats} />

      <DashboardChart isPaid={stats.isPaid} revenue={revenueChart} growth={growth} />

      <DashboardActivityFeed events={events} communitySlug={params.communitySlug} />
    </div>
  );
}
