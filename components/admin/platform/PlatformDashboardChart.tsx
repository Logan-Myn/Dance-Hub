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
  Legend,
} from 'recharts';
import type {
  PlatformRevenuePoint,
  PlatformGrowthPoint,
} from '@/lib/admin-platform/types';

export function PlatformDashboardChart({
  revenue,
  growth,
}: {
  revenue: PlatformRevenuePoint[];
  growth: PlatformGrowthPoint[];
}) {
  const hasRevenue = revenue.some((p) => p.total > 0 || p.platformFees > 0);
  const hasGrowth = growth.some((p) => p.users > 0 || p.communities > 0);

  return (
    <div className="bg-card rounded-2xl border border-border/50 p-6">
      <Tabs defaultValue="revenue">
        <TabsList className="mb-4">
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="growth">Growth</TabsTrigger>
        </TabsList>
        <TabsContent value="revenue">
          {hasRevenue ? <RevenueChart data={revenue} /> : <EmptyState />}
        </TabsContent>
        <TabsContent value="growth">
          {hasGrowth ? <GrowthChart data={growth} /> : <EmptyState />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RevenueChart({ data }: { data: PlatformRevenuePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/40" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} className="text-xs" />
        <YAxis
          tickLine={false}
          axisLine={false}
          className="text-xs"
          tickFormatter={(v) => `€${Math.round(Number(v))}`}
        />
        <Tooltip
          formatter={(value, name) =>
            [
              `€${Number(value).toFixed(2)}`,
              name === 'total' ? 'Communities revenue' : 'Platform fees',
            ] as [string, string]
          }
        />
        <Legend
          formatter={(value) =>
            value === 'total' ? 'Communities revenue' : 'Platform fees'
          }
        />
        <Bar dataKey="total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
        <Bar dataKey="platformFees" fill="hsl(var(--secondary))" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function GrowthChart({ data }: { data: PlatformGrowthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/40" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          className="text-xs"
          interval={14}
        />
        <YAxis tickLine={false} axisLine={false} className="text-xs" allowDecimals={false} />
        <Tooltip />
        <Legend />
        <Line
          type="monotone"
          dataKey="users"
          name="Users"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="communities"
          name="Communities"
          stroke="hsl(var(--secondary))"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function EmptyState() {
  return (
    <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
      Not enough data yet
    </div>
  );
}
