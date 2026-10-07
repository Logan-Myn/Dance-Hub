import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from '@/components/community-admin/ui';
import { formatEur } from '@/lib/admin-platform/format';
import { percentText, trendOf } from '@/lib/admin-platform/display';
import type { PlatformStats } from '@/lib/admin-platform/types';
import { cn } from '@/lib/utils';

interface Tile {
  label: string;
  value: string;
  note: string;
  growth: number;
}

export function PlatformDashboardKpis({ stats }: { stats: PlatformStats }) {
  const tiles: Tile[] = [
    { label: 'Users', value: stats.usersTotal.toLocaleString('en-GB'), note: `${stats.newUsersThisMonth} new this month`, growth: stats.newUsersGrowth },
    { label: 'Communities', value: stats.communitiesTotal.toLocaleString('en-GB'), note: `${stats.newCommunitiesThisMonth} new this month`, growth: stats.newCommunitiesGrowth },
    { label: 'Paid memberships', value: stats.activeSubscriptions.toLocaleString('en-GB'), note: 'Active now', growth: stats.activeSubscriptionsGrowth },
    { label: 'Community revenue', value: formatEur(stats.communitiesRevenueThisMonth), note: 'This month', growth: stats.communitiesRevenueGrowth },
    { label: 'Dance-Hub fees', value: formatEur(stats.platformRevenueThisMonth), note: 'This month', growth: stats.platformRevenueGrowth },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {tiles.map((t) => (
        <Card key={t.label} className="flex flex-col gap-0.5 px-[18px] py-4">
          <span className="text-[13.5px] font-medium text-ink-2">{t.label}</span>
          <span className="font-display text-[26px] font-semibold leading-[1.15] tracking-[-0.01em] tabular-nums text-ink">{t.value}</span>
          <span className="text-[13px] text-ink-3">{t.note}</span>
          <Delta growth={t.growth} />
        </Card>
      ))}
    </div>
  );
}

/** "+12% vs last month", green when up, red when down. */
export function Delta({ growth, className }: { growth: number; className?: string }) {
  const trend = trendOf(growth);
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  return (
    <span
      className={cn(
        'mt-1 inline-flex flex-wrap items-center gap-x-1 text-[13px] font-semibold tabular-nums',
        trend === 'up' ? 'text-ok' : trend === 'down' ? 'text-live' : 'text-ink-3',
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {percentText(growth)}
      <span className="whitespace-nowrap font-normal text-ink-3">vs last month</span>
    </span>
  );
}
