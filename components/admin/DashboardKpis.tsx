import { Users, TrendingUp, DollarSign, MessageSquare, BarChart3 } from 'lucide-react';

interface DashboardKpisProps {
  stats: {
    totalMembers: number;
    activeMembers: number;
    totalThreads: number;
    monthlyRevenue: number;
    membershipGrowth: number;
    revenueGrowth: number;
  };
}

export function DashboardKpis({ stats }: DashboardKpisProps) {
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card rounded-2xl p-6 border-2 border-transparent hover:border-primary/20 hover:shadow-lg transition-all duration-300 ease-out space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">Total Members</h3>
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
          </div>
          <p className="font-display text-3xl font-bold text-foreground">
            {stats.totalMembers}
          </p>
          <p className="text-sm text-primary font-medium">
            <TrendingUp className="h-4 w-4 inline mr-1" />+
            {stats.membershipGrowth}% this month
          </p>
        </div>

        <div className="bg-card rounded-2xl p-6 border-2 border-transparent hover:border-primary/20 hover:shadow-lg transition-all duration-300 ease-out space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">Monthly Revenue</h3>
            <div className="h-10 w-10 rounded-xl bg-secondary/20 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-secondary" />
            </div>
          </div>
          <p className="font-display text-3xl font-bold text-foreground">
            €{stats.monthlyRevenue.toFixed(2)}
          </p>
          <p className="text-sm text-primary font-medium">
            <TrendingUp className="h-4 w-4 inline mr-1" />
            {stats.revenueGrowth >= 0 ? '+' : ''}
            {stats.revenueGrowth}% this month
          </p>
        </div>

        <div className="bg-card rounded-2xl p-6 border-2 border-transparent hover:border-primary/20 hover:shadow-lg transition-all duration-300 ease-out space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">Total Threads</h3>
            <div className="h-10 w-10 rounded-xl bg-accent/20 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-accent" />
            </div>
          </div>
          <p className="font-display text-3xl font-bold text-foreground">
            {stats.totalThreads}
          </p>
          <p className="text-sm text-muted-foreground">Across all categories</p>
        </div>

        <div className="bg-card rounded-2xl p-6 border-2 border-transparent hover:border-primary/20 hover:shadow-lg transition-all duration-300 ease-out space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">Active Members</h3>
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
          </div>
          <p className="font-display text-3xl font-bold text-foreground">
            {stats.activeMembers}
          </p>
          <p className="text-sm text-muted-foreground">Current active memberships</p>
        </div>
      </div>
    </div>
  );
}
