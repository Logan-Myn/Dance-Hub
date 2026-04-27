import { Users, TrendingUp, TrendingDown, DollarSign, MessageSquare, UserMinus } from 'lucide-react';

export interface DashboardStats {
  isPaid: boolean;
  monthlyRevenue: number;
  revenueGrowth: number;
  membersTotal: number;
  membersPaying: number;
  newMembersThisMonth: number;
  newMembersGrowth: number;
  cancellationsThisMonth: number;
  cancellationsLastMonth: number;
  postsThreadsThisMonth: number;
  postsCommentsThisMonth: number;
}

export function DashboardKpis({ stats }: { stats: DashboardStats }) {
  const tiles: React.ReactNode[] = [];

  if (stats.isPaid) {
    tiles.push(
      <Tile
        key="revenue"
        label="Revenue this month"
        value={`€${stats.monthlyRevenue.toFixed(2)}`}
        sublineNumber={stats.revenueGrowth}
        sublineSuffix="vs last month"
        icon={<DollarSign className="h-5 w-5 text-secondary" />}
        iconBg="bg-secondary/20"
      />
    );
  }

  tiles.push(
    <Tile
      key="members"
      label="Members"
      value={stats.membersTotal.toString()}
      sublineText={stats.isPaid ? `${stats.membersPaying} paying` : undefined}
      icon={<Users className="h-5 w-5 text-primary" />}
      iconBg="bg-primary/10"
    />
  );

  tiles.push(
    <Tile
      key="new"
      label="New members this month"
      value={stats.newMembersThisMonth.toString()}
      sublineNumber={stats.newMembersGrowth}
      sublineSuffix="vs last month"
      icon={<TrendingUp className="h-5 w-5 text-primary" />}
      iconBg="bg-primary/10"
    />
  );

  if (stats.isPaid) {
    tiles.push(
      <Tile
        key="cancellations"
        label="Cancellations this month"
        value={stats.cancellationsThisMonth.toString()}
        sublineText={`${stats.cancellationsLastMonth} last month`}
        icon={<UserMinus className="h-5 w-5 text-secondary" />}
        iconBg="bg-secondary/20"
      />
    );
  }

  tiles.push(
    <Tile
      key="posts"
      label="Posts this month"
      value={`${stats.postsThreadsThisMonth} threads`}
      sublineText={`${stats.postsCommentsThisMonth} replies`}
      icon={<MessageSquare className="h-5 w-5 text-accent" />}
      iconBg="bg-accent/20"
    />
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {tiles}
    </div>
  );
}

function Tile({
  label,
  value,
  sublineNumber,
  sublineSuffix,
  sublineText,
  icon,
  iconBg,
}: {
  label: string;
  value: string;
  sublineNumber?: number;
  sublineSuffix?: string;
  sublineText?: string;
  icon: React.ReactNode;
  iconBg: string;
}) {
  const showNumber = typeof sublineNumber === 'number';
  const isPositive = showNumber && (sublineNumber as number) >= 0;

  return (
    <div className="bg-card rounded-2xl p-6 border-2 border-transparent hover:border-primary/20 hover:shadow-lg transition-all duration-300 ease-out space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
        <div className={`h-10 w-10 rounded-xl ${iconBg} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
      <p className="font-display text-3xl font-bold text-foreground">{value}</p>
      {showNumber ? (
        <p className={`text-sm font-medium ${isPositive ? 'text-primary' : 'text-destructive'}`}>
          {isPositive ? (
            <TrendingUp className="h-4 w-4 inline mr-1" />
          ) : (
            <TrendingDown className="h-4 w-4 inline mr-1" />
          )}
          {isPositive ? '+' : ''}
          {sublineNumber}% {sublineSuffix}
        </p>
      ) : sublineText ? (
        <p className="text-sm text-muted-foreground">{sublineText}</p>
      ) : null}
    </div>
  );
}
