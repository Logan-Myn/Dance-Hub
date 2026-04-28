import {
  Users,
  MessageSquare,
  CreditCard,
  DollarSign,
  Percent,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { formatEur } from '@/lib/admin-platform/format';
import type { PlatformStats } from '@/lib/admin-platform/types';

export function PlatformDashboardKpis({ stats }: { stats: PlatformStats }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      <Tile
        label="Users"
        value={stats.usersTotal.toLocaleString()}
        sublineNumber={stats.newUsersGrowth}
        sublineSuffix={`${stats.newUsersThisMonth} new this month`}
        icon={<Users className="h-5 w-5 text-primary" />}
        iconBg="bg-primary/10"
      />
      <Tile
        label="Communities"
        value={stats.communitiesTotal.toLocaleString()}
        sublineNumber={stats.newCommunitiesGrowth}
        sublineSuffix={`${stats.newCommunitiesThisMonth} new this month`}
        icon={<MessageSquare className="h-5 w-5 text-primary" />}
        iconBg="bg-primary/10"
      />
      <Tile
        label="Active subscriptions"
        value={stats.activeSubscriptions.toLocaleString()}
        sublineNumber={stats.activeSubscriptionsGrowth}
        sublineSuffix="vs last month"
        icon={<CreditCard className="h-5 w-5 text-secondary" />}
        iconBg="bg-secondary/20"
      />
      <Tile
        label="Communities revenue"
        value={formatEur(stats.communitiesRevenueThisMonth)}
        sublineNumber={stats.communitiesRevenueGrowth}
        sublineSuffix="vs last month"
        icon={<DollarSign className="h-5 w-5 text-secondary" />}
        iconBg="bg-secondary/20"
      />
      <Tile
        label="Platform revenue"
        value={formatEur(stats.platformRevenueThisMonth)}
        sublineNumber={stats.platformRevenueGrowth}
        sublineSuffix="vs last month"
        icon={<Percent className="h-5 w-5 text-accent" />}
        iconBg="bg-accent/20"
      />
    </div>
  );
}

function Tile({
  label,
  value,
  sublineNumber,
  sublineSuffix,
  icon,
  iconBg,
}: {
  label: string;
  value: string;
  sublineNumber?: number;
  sublineSuffix?: string;
  icon: React.ReactNode;
  iconBg: string;
}) {
  const n = typeof sublineNumber === 'number' ? sublineNumber : null;
  const trend: 'up' | 'down' | 'flat' | null =
    n === null ? null : n > 0 ? 'up' : n < 0 ? 'down' : 'flat';

  return (
    <div className="bg-card rounded-2xl p-6 border-2 border-transparent hover:border-primary/20 hover:shadow-lg transition-all duration-300 ease-out space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
        <div className={`h-10 w-10 rounded-xl ${iconBg} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
      <p className="font-display text-3xl font-bold text-foreground">{value}</p>
      {trend ? (
        <p
          className={`text-sm font-medium ${
            trend === 'up'
              ? 'text-primary'
              : trend === 'down'
              ? 'text-destructive'
              : 'text-muted-foreground'
          }`}
        >
          {trend === 'up' ? (
            <TrendingUp className="h-4 w-4 inline mr-1" />
          ) : trend === 'down' ? (
            <TrendingDown className="h-4 w-4 inline mr-1" />
          ) : (
            <Minus className="h-4 w-4 inline mr-1" />
          )}
          {trend === 'up' ? '+' : ''}
          {sublineNumber}% {sublineSuffix}
        </p>
      ) : null}
    </div>
  );
}
