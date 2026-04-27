'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { RevenuePoint, GrowthPoint } from '@/lib/admin-dashboard/types';

export function DashboardChart({
  isPaid,
  revenue,
  growth,
}: {
  isPaid: boolean;
  revenue: RevenuePoint[];
  growth: GrowthPoint[];
}) {
  const hasGrowthData = growth.some((p) => p.count > 0);
  const hasRevenueData = revenue.some((p) => p.revenue > 0);

  if (!isPaid) {
    return (
      <div className="bg-card rounded-2xl border border-border/50 p-6">
        <h2 className="font-display text-lg font-semibold mb-4">Member growth (last 90 days)</h2>
        {hasGrowthData ? <GrowthChart data={growth} /> : <EmptyState />}
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border/50 p-6">
      <Tabs defaultValue="revenue">
        <TabsList className="mb-4">
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>
        <TabsContent value="revenue">
          {hasRevenueData ? <RevenueChart data={revenue} /> : <EmptyState />}
        </TabsContent>
        <TabsContent value="members">
          {hasGrowthData ? <GrowthChart data={growth} /> : <EmptyState />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RevenueChart({ data }: { data: RevenuePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/40" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} className="text-xs" />
        <YAxis tickLine={false} axisLine={false} className="text-xs" tickFormatter={(v) => `€${v}`} />
        <Tooltip
          formatter={(v) => [`€${Number(v).toFixed(2)}`, 'Revenue'] as [string, string]}
        />
        <Bar dataKey="revenue" radius={[6, 6, 0, 0]} className="fill-primary" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function GrowthChart({ data }: { data: GrowthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/40" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} className="text-xs" interval={14} />
        <YAxis tickLine={false} axisLine={false} className="text-xs" allowDecimals={false} />
        <Tooltip />
        <Line type="monotone" dataKey="count" strokeWidth={2} dot={false} className="stroke-primary" />
      </LineChart>
    </ResponsiveContainer>
  );
}

function EmptyState() {
  return (
    <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
      Not enough data yet
    </div>
  );
}
