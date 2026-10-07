'use client';

import useSWR from 'swr';
import { ExternalLink } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BTN_SECONDARY } from '@/components/community-feed/feed-header';
import { Skeleton } from '@/components/ds/skeleton';
import { formatEur } from '@/lib/admin-platform/format';
import { monthLabel, monthLongLabel } from '@/lib/admin-platform/display';
import type { CommunitySnapshot } from '@/lib/admin-platform/community-snapshot';
import { communityPath } from '@/lib/safe-redirect';
import { cn } from '@/lib/utils';
import { Delta } from './PlatformDashboardKpis';

const fetcher = (url: string) =>
  fetch(url).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Couldn't load this community's numbers.");
    }
    return res.json();
  });

const AXIS = { fontSize: 12, fill: 'rgb(var(--ds-ink-3))' };

/** Numbers for one community, shown under its row. */
export function CommunityDetailPanel({ communityId, slug }: { communityId: string; slug: string }) {
  const { data, error, isLoading } = useSWR<CommunitySnapshot>(`/api/admin/communities/${communityId}/snapshot`, fetcher, {
    revalidateOnFocus: false,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 p-5 lg:grid-cols-4" aria-busy="true" aria-label="Loading">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[92px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <p role="alert" className="px-5 py-4 text-[14px] font-medium text-live">
        {error instanceof Error ? error.message : "Couldn't load this community's numbers."}
      </p>
    );
  }

  const chart = data.revenueChart6Months.map((p) => ({ ...p, label: monthLabel(p.month), long: monthLongLabel(p.month) }));

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-[18px] font-semibold text-ink">{data.name}</h3>
          <p className="text-[13px] text-ink-3">dance-hub.io/{data.slug}</p>
        </div>
        <a href={communityPath(slug)} target="_blank" rel="noopener noreferrer" className={cn(BTN_SECONDARY, 'h-9')}>
          <ExternalLink aria-hidden="true" />
          Open community
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {data.isPaid && (
          <Mini label="Revenue this month" value={formatEur(data.monthlyRevenue)}>
            <Delta growth={data.revenueGrowth} />
          </Mini>
        )}
        <Mini label="Members with access" value={data.membersTotal.toLocaleString('en-GB')} />
        <Mini label="New this month" value={data.newMembersThisMonth.toLocaleString('en-GB')}>
          <Delta growth={data.newMembersGrowth} />
        </Mini>
        {data.isPaid && (
          <Mini label="Cancelled this month" value={data.cancellationsThisMonth.toLocaleString('en-GB')}>
            <span className="mt-1 text-[13px] text-ink-3">{data.cancellationsLastMonth} last month</span>
          </Mini>
        )}
      </div>

      {data.isPaid && (
        <div className="rounded-xl border border-line bg-surface px-3 pb-3 pt-4 sm:px-4">
          <h4 className="px-1 font-display text-[15px] font-semibold text-ink">Revenue, last 6 months</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chart} margin={{ top: 12, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgb(var(--ds-line))" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} />
              <YAxis tickLine={false} axisLine={false} width={48} tick={AXIS} tickFormatter={(v) => `€${Math.round(Number(v))}`} />
              <Tooltip
                cursor={{ fill: 'rgb(var(--ds-surface-2))' }}
                labelFormatter={(_, payload) => (payload?.[0]?.payload as { long?: string } | undefined)?.long ?? ''}
                formatter={(v) => [`€${Number(v).toFixed(2)}`, 'Revenue']}
              />
              <Bar dataKey="revenue" radius={[4, 4, 0, 0]} fill="rgb(var(--ds-brand))" maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-surface px-4 py-3">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      <span className="font-display text-[22px] font-semibold tabular-nums text-ink">{value}</span>
      {children}
    </div>
  );
}
