'use client';

import useSWR from 'swr';
import Link from 'next/link';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  UserPlus,
  UserMinus,
  DollarSign,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatEur } from '@/lib/admin-platform/format';
import type { CommunitySnapshot } from '@/lib/admin-platform/community-snapshot';

const fetcher = (url: string) =>
  fetch(url).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Failed to load community snapshot');
    }
    return res.json();
  });

export function CommunityDetailPanel({
  communityId,
  slug,
}: {
  communityId: string;
  slug: string;
}) {
  const { data, error, isLoading } = useSWR<CommunitySnapshot>(
    `/api/admin/communities/${communityId}/snapshot`,
    fetcher,
    { revalidateOnFocus: false }
  );

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading details…</div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Failed to load details.'}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-display text-xl font-semibold">{data.name}</h3>
          <p className="text-xs text-muted-foreground">/{data.slug}</p>
        </div>
        <Link href={`/${slug}`} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Visit community
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {data.isPaid ? (
          <KpiTile
            label="Revenue this month"
            value={formatEur(data.monthlyRevenue)}
            growth={data.revenueGrowth}
            growthSuffix="vs last month"
            icon={<DollarSign className="h-4 w-4 text-secondary" />}
            iconBg="bg-secondary/20"
          />
        ) : null}
        <KpiTile
          label="Active members"
          value={data.membersTotal.toLocaleString()}
          icon={<Users className="h-4 w-4 text-primary" />}
          iconBg="bg-primary/10"
        />
        <KpiTile
          label="New this month"
          value={data.newMembersThisMonth.toLocaleString()}
          growth={data.newMembersGrowth}
          growthSuffix="vs last month"
          icon={<UserPlus className="h-4 w-4 text-primary" />}
          iconBg="bg-primary/10"
        />
        {data.isPaid ? (
          <KpiTile
            label="Cancellations"
            value={data.cancellationsThisMonth.toLocaleString()}
            sublineText={`${data.cancellationsLastMonth} last month`}
            icon={<UserMinus className="h-4 w-4 text-secondary" />}
            iconBg="bg-secondary/20"
          />
        ) : null}
      </div>

      {data.isPaid ? (
        <div className="bg-card rounded-xl border border-border/50 p-4">
          <h4 className="text-sm font-medium mb-3">Revenue (last 6 months)</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={data.revenueChart6Months}
              margin={{ top: 4, right: 4, left: 4, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                className="stroke-border/40"
              />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                className="text-xs"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                className="text-xs"
                tickFormatter={(v) => `€${Math.round(Number(v))}`}
              />
              <Tooltip
                formatter={(value) =>
                  [`€${Number(value).toFixed(2)}`, 'Revenue'] as [string, string]
                }
              />
              <Bar
                dataKey="revenue"
                fill="hsl(var(--primary))"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}

function KpiTile({
  label,
  value,
  growth,
  growthSuffix,
  sublineText,
  icon,
  iconBg,
}: {
  label: string;
  value: string;
  growth?: number;
  growthSuffix?: string;
  sublineText?: string;
  icon: React.ReactNode;
  iconBg: string;
}) {
  const trend: 'up' | 'down' | 'flat' | null =
    typeof growth === 'number'
      ? growth > 0
        ? 'up'
        : growth < 0
        ? 'down'
        : 'flat'
      : null;

  return (
    <div className="bg-card rounded-xl border border-border/50 p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <div className={`h-7 w-7 rounded-lg ${iconBg} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
      <p className="font-display text-xl font-bold">{value}</p>
      {trend ? (
        <p
          className={`text-xs font-medium flex items-center gap-1 ${
            trend === 'up'
              ? 'text-primary'
              : trend === 'down'
              ? 'text-destructive'
              : 'text-muted-foreground'
          }`}
        >
          {trend === 'up' ? (
            <TrendingUp className="h-3 w-3" />
          ) : trend === 'down' ? (
            <TrendingDown className="h-3 w-3" />
          ) : (
            <Minus className="h-3 w-3" />
          )}
          {trend === 'up' ? '+' : ''}
          {growth}% {growthSuffix}
        </p>
      ) : sublineText ? (
        <p className="text-xs text-muted-foreground">{sublineText}</p>
      ) : null}
    </div>
  );
}
