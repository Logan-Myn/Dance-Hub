import { requirePlatformAdminPage } from '@/lib/community-auth';
import {
  getUserStats,
  getCommunityStats,
  getGrowthSeries90Days,
} from '@/lib/admin-platform/stats';
import {
  getMonthlyRevenueStats,
  getRevenueChart6Months,
  getActiveSubscriptionsStats,
} from '@/lib/admin-platform/revenue';
import {
  getRecentSignups,
  getRecentCommunities,
  getRecentAdminActions,
  getRecentFailedPaymentsAcrossPlatform,
  mergePlatformEvents,
} from '@/lib/admin-platform/activity-feed';
import { PlatformDashboardKpis } from '@/components/admin/platform/PlatformDashboardKpis';
import { PlatformDashboardChart } from '@/components/admin/platform/PlatformDashboardChart';
import { PlatformDashboardActivityFeed } from '@/components/admin/platform/PlatformDashboardActivityFeed';
import type { PlatformStats } from '@/lib/admin-platform/types';
import { Screen, ScreenHead } from '@/components/community-admin/ui';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function AdminDashboard() {
  await requirePlatformAdminPage();
  const now = new Date();

  const [
    userStats,
    communityStats,
    revenueStats,
    subscriptionStats,
    revenueChart,
    growthSeries,
    signups,
    communities,
    adminActions,
    failedPayments,
  ] = await Promise.all([
    getUserStats(now),
    getCommunityStats(now),
    getMonthlyRevenueStats(now),
    getActiveSubscriptionsStats(now),
    getRevenueChart6Months(now),
    getGrowthSeries90Days(now),
    getRecentSignups(),
    getRecentCommunities(),
    getRecentAdminActions(),
    getRecentFailedPaymentsAcrossPlatform(now),
  ]);

  const stats: PlatformStats = {
    usersTotal: userStats.total,
    newUsersThisMonth: userStats.newThisMonth,
    newUsersGrowth: userStats.growth,
    communitiesTotal: communityStats.total,
    newCommunitiesThisMonth: communityStats.newThisMonth,
    newCommunitiesGrowth: communityStats.growth,
    activeSubscriptions: subscriptionStats.count,
    activeSubscriptionsGrowth: subscriptionStats.growth,
    platformRevenueThisMonth: revenueStats.platformRevenueThisMonth,
    platformRevenueGrowth: revenueStats.platformRevenueGrowth,
    communitiesRevenueThisMonth: revenueStats.communitiesRevenueThisMonth,
    communitiesRevenueGrowth: revenueStats.communitiesRevenueGrowth,
  };

  const events = mergePlatformEvents(
    [signups, communities, adminActions, failedPayments],
    10
  );

  return (
    <Screen>
      <ScreenHead title="Dashboard" sub="Everything on Dance-Hub: people, communities and money." />
      <PlatformDashboardKpis stats={stats} />
      <PlatformDashboardChart revenue={revenueChart} growth={growthSeries} />
      <PlatformDashboardActivityFeed events={events} />
    </Screen>
  );
}
