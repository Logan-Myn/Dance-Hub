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

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function AdminDashboard() {
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
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500 space-y-8">
      <header>
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">
          Dashboard
        </h1>
        <p className="text-muted-foreground mt-2">
          Platform-wide overview across all communities, users, and revenue.
        </p>
      </header>

      <PlatformDashboardKpis stats={stats} />

      <PlatformDashboardChart revenue={revenueChart} growth={growthSeries} />

      <PlatformDashboardActivityFeed events={events} />
    </div>
  );
}
