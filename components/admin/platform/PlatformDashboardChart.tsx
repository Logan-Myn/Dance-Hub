'use client';

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardHead } from '@/components/community-admin/ui';
import { Segmented } from '@/components/ds/segmented';
import { dayLabel, monthLabel, monthLongLabel } from '@/lib/admin-platform/display';
import type { PlatformGrowthPoint, PlatformRevenuePoint } from '@/lib/admin-platform/types';

const AXIS = { fontSize: 12, fill: 'rgb(var(--ds-ink-3))' };
const BRAND = 'rgb(var(--ds-brand))';
const OK = 'rgb(var(--ds-ok))';

type View = 'revenue' | 'growth';

export function PlatformDashboardChart({ revenue, growth }: { revenue: PlatformRevenuePoint[]; growth: PlatformGrowthPoint[] }) {
  const [view, setView] = useState<View>('revenue');
  const hasRevenue = revenue.some((p) => p.total > 0 || p.platformFees > 0);
  const hasGrowth = growth.some((p) => p.users > 0 || p.communities > 0);
  const revenueData = revenue.map((p) => ({ ...p, label: monthLabel(p.month), long: monthLongLabel(p.month) }));
  const growthData = growth.map((p) => ({ ...p, label: dayLabel(p.date) }));

  return (
    <Card as="section" aria-labelledby="platform-chart-h">
      <CardHead
        id="platform-chart-h"
        title={view === 'revenue' ? 'Revenue' : 'Growth'}
        sub={view === 'revenue' ? 'What members paid communities each month, and the Dance-Hub fee on it' : 'Total users and communities over the last 90 days'}
        aside={
          <Segmented
            label="Chart"
            value={view}
            onChange={setView}
            options={[
              { value: 'revenue', label: 'Revenue' },
              { value: 'growth', label: 'Growth' },
            ]}
          />
        }
      />
      <div className="px-3 pb-4 pt-3 sm:px-5">
        {view === 'revenue' ? (
          hasRevenue ? (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={revenueData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="rgb(var(--ds-line))" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} />
                  <YAxis tickLine={false} axisLine={false} width={52} tick={AXIS} tickFormatter={(v) => `€${Math.round(Number(v))}`} />
                  <Tooltip
                    cursor={{ fill: 'rgb(var(--ds-surface-2))' }}
                    labelFormatter={(_, payload) => (payload?.[0]?.payload as { long?: string } | undefined)?.long ?? ''}
                    formatter={(v, name) => [`€${Number(v).toFixed(2)}`, name === 'total' ? 'Paid by members' : 'Dance-Hub fees']}
                  />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]} fill={BRAND} maxBarSize={40} />
                  <Bar dataKey="platformFees" radius={[4, 4, 0, 0]} fill={OK} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
              <Legend items={[{ color: BRAND, label: 'Paid by members' }, { color: OK, label: 'Dance-Hub fees' }]} />
            </>
          ) : (
            <Empty>No payments yet. They show up here month by month.</Empty>
          )
        ) : hasGrowth ? (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={growthData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgb(var(--ds-line))" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} minTickGap={28} />
                <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} tick={AXIS} />
                <Tooltip formatter={(v, name) => [String(v), name === 'users' ? 'Users' : 'Communities']} />
                <Line type="monotone" dataKey="users" strokeWidth={2.5} dot={false} stroke={BRAND} />
                <Line type="monotone" dataKey="communities" strokeWidth={2.5} dot={false} stroke={OK} />
              </LineChart>
            </ResponsiveContainer>
            <Legend items={[{ color: BRAND, label: 'Users' }, { color: OK, label: 'Communities' }]} />
          </>
        ) : (
          <Empty>Not enough history yet.</Empty>
        )}
      </div>
    </Card>
  );
}

function Legend({ items }: { items: Array<{ color: string; label: string }> }) {
  return (
    <ul className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-[13px] text-ink-2">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-[14.5px] text-ink-2">{children}</p>;
}
