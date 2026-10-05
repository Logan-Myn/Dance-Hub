import { requireCommunityManagerPage } from '@/lib/community-auth';
import { queryOne, query } from '@/lib/db';
import { getCommunityBySlug } from '@/lib/community-data';
import {
  getCalendarMonthRange,
  getMonthlyRevenue,
  getRevenueChart6Months,
  buildMemberGrowthSeries,
  getLessonRevenue,
} from '@/lib/admin-dashboard/stats';
import {
  mergeActivityEvents,
  getRecentFailedPayments,
} from '@/lib/admin-dashboard/activity-feed';
import type { ActivityEvent } from '@/lib/admin-dashboard/types';
import { getAttention } from '@/lib/admin/attention';
import { getNextSevenDays, getRecentBookings, getSetup } from '@/lib/admin/overview';
import { OverviewClient, type ActivityRow, type Kpi } from '@/components/community-admin/overview-client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// The moment this request renders.
function requestTime(): number {
  return Date.now();
}

const euro = (n: number) => `€${n.toFixed(n % 1 ? 2 : 0)}`;
const pct = (n: number) => `${n > 0 ? '+' : ''}${n}% vs last month`;

type CountRow = { count: number };
type JoinEvent = { user_id: string; display_name: string | null; avatar_url: string | null; joined_at: Date };
type CancelEvent = { user_id: string; display_name: string | null; avatar_url: string | null; cancelled_at: Date };
type PostEvent = { id: string; user_id: string; author_name: string | null; author_image: string | null; category_name: string | null; created_at: Date };

export default async function AdminDashboardPage(
  props: {
    params: Promise<{ communitySlug: string }>;
  }
) {
  const params = await props.params;
  await requireCommunityManagerPage(params.communitySlug);
  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) return null;

  const now = new Date(requestTime());
  const thisMonth = getCalendarMonthRange(now, 0);
  const lastMonth = getCalendarMonthRange(now, -1);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const [
    memberAggregateRow,
    threadsRow,
    commentsRow,
    revenue,
    revenueChart,
    lessonRevenue,
    joinsLast90,
    cancelsLast90,
    recentJoinEvents,
    recentCancelEvents,
    recentPostEvents,
    failedPayments,
  ] = await Promise.all([
    queryOne<{
      total: number;
      new_this_month: number;
      new_last_month: number;
      cancelled_this_month: number;
      cancelled_last_month: number;
    }>`
      SELECT
        COUNT(*) FILTER (WHERE status='active')::int AS total,
        COUNT(*) FILTER (
          WHERE joined_at >= ${thisMonth.start.toISOString()}
            AND joined_at < ${thisMonth.end.toISOString()}
        )::int AS new_this_month,
        COUNT(*) FILTER (
          WHERE joined_at >= ${lastMonth.start.toISOString()}
            AND joined_at < ${lastMonth.end.toISOString()}
        )::int AS new_last_month,
        COUNT(*) FILTER (
          WHERE status IN ('inactive','cancelled')
            AND cancelled_at >= ${thisMonth.start.toISOString()}
            AND cancelled_at < ${thisMonth.end.toISOString()}
        )::int AS cancelled_this_month,
        COUNT(*) FILTER (
          WHERE status IN ('inactive','cancelled')
            AND cancelled_at >= ${lastMonth.start.toISOString()}
            AND cancelled_at < ${lastMonth.end.toISOString()}
        )::int AS cancelled_last_month
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id != ${community.created_by}
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
    getMonthlyRevenue(community.stripe_account_id ?? null, now),
    getRevenueChart6Months(community.stripe_account_id ?? null, now),
    getLessonRevenue(community.id, now),
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
      LEFT JOIN profiles p ON cm.user_id = p.auth_user_id
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
      LEFT JOIN profiles p ON cm.user_id = p.auth_user_id
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
    getRecentFailedPayments(community.stripe_account_id ?? null, now),
  ]);
  const [attention, upcoming, bookings] = await Promise.all([
    getAttention(community, now),
    getNextSevenDays(community, now),
    getRecentBookings(community.id),
  ]);

  const membersTotal = memberAggregateRow?.total ?? 0;
  const newMembersThisMonth = memberAggregateRow?.new_this_month ?? 0;
  const cancellationsThisMonth = memberAggregateRow?.cancelled_this_month ?? 0;
  const cancellationsLastMonth = memberAggregateRow?.cancelled_last_month ?? 0;
  const threadsThisMonth = threadsRow?.count ?? 0;
  const commentsThisMonth = commentsRow?.count ?? 0;

  const paid = !!community.membership_enabled && Number(community.membership_price ?? 0) > 0;
  const kpis: Kpi[] = [];
  if (paid) {
    kpis.push({
      label: 'Revenue this month',
      value: euro(revenue.monthlyRevenue),
      delta: pct(revenue.revenueGrowth),
      tone: revenue.revenueGrowth > 0 ? 'good' : revenue.revenueGrowth < 0 ? 'bad' : 'flat',
      trend: revenue.revenueGrowth > 0 ? 'up' : revenue.revenueGrowth < 0 ? 'down' : undefined,
    });
  }
  kpis.push({
    label: 'Active members',
    value: String(membersTotal),
    delta: newMembersThisMonth ? `+${newMembersThisMonth} this month` : 'No new members this month',
    tone: newMembersThisMonth ? 'good' : 'flat',
    trend: newMembersThisMonth ? 'up' : undefined,
  });
  kpis.push({
    label: 'Private lessons',
    value: euro(lessonRevenue.thisMonth),
    delta: `${lessonRevenue.thisMonthCount} ${lessonRevenue.thisMonthCount === 1 ? 'booking' : 'bookings'} this month`,
    tone: 'flat',
  });
  if (paid) {
    kpis.push({
      label: 'Cancellations',
      value: String(cancellationsThisMonth),
      delta: `${cancellationsLastMonth} last month`,
      tone: cancellationsThisMonth < cancellationsLastMonth ? 'good' : cancellationsThisMonth > cancellationsLastMonth ? 'bad' : 'flat',
    });
  } else {
    kpis.push({
      label: 'Posts this month',
      value: String(threadsThisMonth),
      delta: `${commentsThisMonth} ${commentsThisMonth === 1 ? 'reply' : 'replies'}`,
      tone: 'flat',
    });
  }

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
  // Cached results come back with dates as strings.
  const failed = failedPayments.map((e) => ({ ...e, at: new Date(e.at) }));

  const slug = params.communitySlug;
  const fromEvents: ActivityRow[] = mergeActivityEvents([joins, cancels, posts, failed], 12).map((e, i) => {
    const at = e.at.toISOString();
    switch (e.type) {
      case 'join':
        return { key: `j${i}`, kind: 'members', icon: 'join', at, name: e.displayName, avatarId: e.userId, avatarUrl: e.avatarUrl, title: `${e.displayName} joined`, detail: null, href: null };
      case 'cancel':
        return { key: `c${i}`, kind: 'members', icon: 'leave', at, name: e.displayName, avatarId: e.userId, avatarUrl: e.avatarUrl, title: `${e.displayName} left`, detail: null, href: null };
      case 'post':
        return {
          key: `p${i}`, kind: 'posts', icon: 'post', at, name: e.displayName, avatarId: e.userId, avatarUrl: e.avatarUrl,
          title: `${e.displayName} posted${e.categoryName ? ` in ${e.categoryName}` : ''}`, detail: null, href: `/${slug}?thread=${e.threadId}`,
        };
      default:
        return {
          key: `f${i}`, kind: 'payments', icon: 'failed', at, name: e.displayName, avatarId: e.userId ?? e.displayName, avatarUrl: null,
          title: `Payment failed for ${e.displayName}`, detail: `${euro(e.amount)} declined. It's retried automatically.`, href: `/${slug}/admin/members?filter=failed`,
        };
    }
  });
  const fromBookings: ActivityRow[] = bookings.map((b) => ({
    key: `b${b.id}`, kind: 'lessons', icon: 'lesson', at: b.at, name: b.studentName, avatarId: b.studentName, avatarUrl: null,
    title: `${b.studentName} booked ${b.lessonTitle}`, detail: `Paid ${euro(b.pricePaid)}`, href: `/${slug}/private-lessons`,
  }));
  const activity = [...fromEvents, ...fromBookings].sort((x, y) => y.at.localeCompare(x.at)).slice(0, 14);
  const setup = await getSetup(community, membersTotal, now);

  return (
    <OverviewClient
      slug={slug}
      communityName={community.name}
      serverNow={now.getTime()}
      attention={attention}
      setup={setup}
      kpis={kpis}
      paid={paid}
      revenue={revenueChart}
      growth={growth}
      activity={activity}
      upcoming={upcoming}
      memberCount={membersTotal}
    />
  );
}
