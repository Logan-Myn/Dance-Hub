"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  CreditCard,
  GraduationCap,
  Info,
  Link2,
  MessageSquare,
  TrendingDown,
  TrendingUp,
  UserMinus,
  UserPlus,
  Video,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BTN_PRIMARY, BTN_SECONDARY, copyInviteLink } from "@/components/community-feed/feed-header";
import { clock } from "@/components/community-calendar/format";
import { Card, CardHead, Screen, ScreenHead } from "@/components/community-admin/ui";
import { Chip } from "@/components/ds/chip";
import { EmptyState } from "@/components/ds/empty-state";
import { InitialsAvatar } from "@/components/ds/initials-avatar";
import { Segmented } from "@/components/ds/segmented";
import { useNow } from "@/hooks/use-now";
import { useViewerTimeZone } from "@/hooks/use-viewer-time-zone";
import type { AttentionItem } from "@/lib/admin/attention";
import type { SetupItem, UpcomingItem } from "@/lib/admin/overview";
import type { GrowthPoint, RevenuePoint } from "@/lib/admin-dashboard/types";
import { relativeDayWord } from "@/lib/time/format";
import { timeAgo } from "@/lib/feed/time-ago";
import { cn } from "@/lib/utils";

export interface Kpi {
  label: string;
  value: string;
  delta: string | null;
  tone: "good" | "bad" | "flat";
  trend?: "up" | "down";
}

export type ActivityKind = "members" | "posts" | "payments" | "lessons";
export interface ActivityRow {
  key: string;
  kind: ActivityKind;
  icon: "join" | "leave" | "post" | "failed" | "lesson";
  at: string;
  name: string;
  avatarId: string;
  avatarUrl: string | null;
  title: string;
  detail: string | null;
  href: string | null;
}

const ATT_ICON = { critical: AlertTriangle, warn: AlertTriangle, info: Info } as const;
const ATT_TONE = {
  critical: "bg-live-soft text-live",
  warn: "bg-warn-soft text-warn",
  info: "bg-brand-soft text-brand-ink",
} as const;
const ACT_ICON = { join: UserPlus, leave: UserMinus, post: MessageSquare, failed: CreditCard, lesson: GraduationCap } as const;

export function OverviewClient({
  slug,
  communityName,
  serverNow,
  attention,
  setup,
  kpis,
  paid,
  revenue,
  growth,
  activity,
  upcoming,
  memberCount,
}: {
  slug: string;
  communityName: string;
  serverNow: number;
  attention: AttentionItem[];
  setup: SetupItem[];
  kpis: Kpi[];
  paid: boolean;
  revenue: RevenuePoint[];
  growth: GrowthPoint[];
  activity: ActivityRow[];
  upcoming: UpcomingItem[];
  memberCount: number;
}) {
  const now = useNow(60_000, serverNow) ?? new Date(serverNow);
  const timeZone = useViewerTimeZone(null);
  const [chart, setChart] = useState<"revenue" | "members">(paid ? "revenue" : "members");
  const [filter, setFilter] = useState<"all" | ActivityKind>("all");
  const done = setup.filter((s) => s.done).length;
  const fresh = memberCount === 0;
  const kinds = (["members", "posts", "payments", "lessons"] as const).filter((k) => activity.some((a) => a.kind === k));
  const shown = activity.filter((a) => filter === "all" || a.kind === filter);
  const today = new Date(serverNow).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone });

  return (
    <Screen>
      <ScreenHead
        title="Overview"
        sub={`${communityName}, ${today}`}
        actions={
          <button type="button" className={BTN_SECONDARY} onClick={() => copyInviteLink(slug)}>
            <Link2 aria-hidden="true" />
            Copy invite link
          </button>
        }
      />

      <Card as="section" aria-labelledby="att-h">
        <CardHead id="att-h" title="Needs your attention" aside={attention.length ? `${attention.length} ${attention.length === 1 ? "item" : "items"}` : null} />
        {attention.length === 0 ? (
          <p className="flex items-center gap-3 px-5 py-[18px] text-[15px] text-ink-2">
            <CheckCircle2 className="h-5 w-5 text-ok" aria-hidden="true" />
            You&apos;re all caught up. Nothing needs your attention right now.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {attention.map((a) => {
              const Icon = ATT_ICON[a.severity];
              return (
                <li key={a.id} className="grid grid-cols-[38px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2.5 px-5 py-3.5 sm:grid-cols-[38px_minmax(0,1fr)_auto]">
                  <span aria-hidden="true" className={cn("grid h-[38px] w-[38px] place-items-center rounded-[11px]", ATT_TONE[a.severity])}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <strong className="block text-[15px] text-ink">{a.title}</strong>
                    <p className="mt-0.5 text-[13.5px] text-ink-2">{a.text}</p>
                  </div>
                  <Link href={a.action.href} className={cn(a.severity === "critical" ? BTN_PRIMARY : BTN_SECONDARY, "col-start-2 h-9 justify-self-start sm:col-start-3")}>
                    {a.action.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {done < setup.length && (
        <Card as="section" aria-labelledby="setup-h" className="flex flex-col gap-3 px-5 py-[18px]">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="setup-h" className="font-display text-[17px] font-semibold text-ink">
              Community setup
            </h2>
            <span className="text-[13px] tabular-nums text-ink-3">
              {done} of {setup.length}
            </span>
          </div>
          <span className="block h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
            <span className="block h-full rounded-full bg-ok transition-[width] duration-500" style={{ width: `${(done / setup.length) * 100}%` }} />
          </span>
          <ul className="grid gap-x-8 sm:grid-cols-2">
            {setup.map((s) => (
              <li key={s.label} className="flex items-center gap-2.5 border-t border-line py-2 text-[14px] sm:[&:nth-child(-n+2)]:border-t-0 [&:first-child]:border-t-0">
                <span aria-hidden="true" className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", s.done ? "border-ok bg-ok text-white" : "border-line-strong")}>
                  {s.done && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className={cn("min-w-0 flex-1", s.done ? "text-ink-2" : "text-ink")}>
                  <span className="sr-only">{s.done ? "Done: " : "To do: "}</span>
                  {s.label}
                </span>
                {!s.done && (
                  <Link href={s.href} className="text-[13px] font-semibold text-brand-ink hover:underline hover:underline-offset-[3px]">
                    Set up
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {fresh && (
        <EmptyState
          icon={<UserPlus className="h-7 w-7" />}
          title="Invite your first members"
          actions={
            <button type="button" className={BTN_PRIMARY} onClick={() => copyInviteLink(slug)}>
              <Link2 aria-hidden="true" />
              Copy invite link
            </button>
          }
        >
          Share your About page with the dancers you teach. Your numbers show up here after the first one joins.
        </EmptyState>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="flex flex-col gap-1 px-[18px] py-4">
            <span className="text-[13.5px] font-medium text-ink-2">{k.label}</span>
            <span className="font-display text-[26px] font-semibold leading-[1.15] tracking-[-0.01em] tabular-nums text-ink sm:text-[28px]">{k.value}</span>
            {k.delta && (
              <span className={cn("inline-flex items-center gap-1 text-[13px] font-semibold tabular-nums", k.tone === "good" ? "text-ok" : k.tone === "bad" ? "text-live" : "text-ink-3")}>
                {k.trend === "up" && <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />}
                {k.trend === "down" && <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />}
                {k.delta}
              </span>
            )}
          </Card>
        ))}
      </div>

      {!fresh && (
        <Card as="section" aria-labelledby="chart-h">
          <CardHead
            id="chart-h"
            title={chart === "revenue" ? "Revenue" : "Members"}
            sub={chart === "revenue" ? "Payments received each month, before fees" : "Active members over the last 90 days"}
            aside={
              paid ? (
                <Segmented
                  label="Chart"
                  value={chart}
                  onChange={setChart}
                  options={[
                    { value: "revenue", label: "Revenue" },
                    { value: "members", label: "Members" },
                  ]}
                />
              ) : null
            }
          />
          <div className="px-3 pb-4 pt-3 sm:px-5">
            {chart === "revenue" ? (
              revenue.some((p) => p.revenue > 0) ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={revenue} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="rgb(var(--ds-line))" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "rgb(var(--ds-ink-3))" }} />
                    <YAxis tickLine={false} axisLine={false} width={48} tick={{ fontSize: 12, fill: "rgb(var(--ds-ink-3))" }} tickFormatter={(v) => `€${v}`} />
                    <Tooltip cursor={{ fill: "rgb(var(--ds-surface-2))" }} formatter={(v) => [`€${Number(v).toFixed(2)}`, "Revenue"]} />
                    <Bar dataKey="revenue" radius={[4, 4, 0, 0]} fill="rgb(var(--ds-brand))" maxBarSize={44} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-[14.5px] text-ink-2">No payments yet. They show up here month by month.</p>
              )
            ) : growth.some((p) => p.count > 0) ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={growth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="rgb(var(--ds-line))" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} interval={14} tick={{ fontSize: 12, fill: "rgb(var(--ds-ink-3))" }} />
                  <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} tick={{ fontSize: 12, fill: "rgb(var(--ds-ink-3))" }} />
                  <Tooltip formatter={(v) => [String(v), "Members"]} />
                  <Line type="monotone" dataKey="count" strokeWidth={2.5} dot={false} stroke="rgb(var(--ds-brand))" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-[14.5px] text-ink-2">Not enough history yet.</p>
            )}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card as="section" aria-labelledby="feed-h">
          <CardHead id="feed-h" title="Recent activity" />
          {kinds.length > 1 && (
            <div role="group" aria-label="Filter activity" className="flex gap-1.5 overflow-x-auto px-5 pt-3 [scrollbar-width:none]">
              <Chip label="All" pressed={filter === "all"} onClick={() => setFilter("all")} />
              {kinds.map((k) => (
                <Chip key={k} label={k[0].toUpperCase() + k.slice(1)} pressed={filter === k} onClick={() => setFilter(k)} />
              ))}
            </div>
          )}
          {shown.length === 0 ? (
            <p className="px-5 py-6 text-[14.5px] text-ink-2">Nothing yet. Joins, posts, payments and bookings show up here.</p>
          ) : (
            <ul className="mt-1.5 divide-y divide-line pb-1.5">
              {shown.map((a) => {
                const Icon = ACT_ICON[a.icon];
                const row = (
                  <>
                    <InitialsAvatar id={a.avatarId} name={a.name} imageUrl={a.avatarUrl} size={32} />
                    <span className="min-w-0 flex-1">
                      <strong className="block text-[14.5px] font-semibold text-ink">{a.title}</strong>
                      {a.detail && <span className="block truncate text-[13px] text-ink-3">{a.detail}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-[12.5px] text-ink-3">
                      <Icon className={cn("h-4 w-4", a.icon === "failed" ? "text-live" : a.icon === "join" ? "text-ok" : "text-ink-3")} aria-hidden="true" />
                      <time dateTime={a.at}>{timeAgo(a.at, now, timeZone)}</time>
                    </span>
                  </>
                );
                return (
                  <li key={a.key}>
                    {a.href ? (
                      <Link href={a.href} className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface-2">
                        {row}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-5 py-2.5">{row}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card as="section" aria-labelledby="up-h">
          <CardHead id="up-h" title="Next 7 days" />
          {upcoming.length === 0 ? (
            <p className="px-5 py-6 text-[14.5px] text-ink-2">No live classes or private lessons in the next 7 days.</p>
          ) : (
            <ul className="mt-1.5 divide-y divide-line pb-1.5">
              {upcoming.map((u) => (
                <li key={`${u.kind}-${u.id}`}>
                  <Link href={u.href} className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface-2">
                    <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-brand-soft text-brand-ink">
                      {u.kind === "live" ? <Video className="h-4 w-4" /> : <GraduationCap className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-[14.5px] font-semibold text-ink">{u.title}</strong>
                      <span className="text-[13px] tabular-nums text-ink-3">
                        {relativeDayWord(u.startsAt, now, timeZone, "en-GB")} at {clock(u.startsAt, timeZone)}
                        {u.detail ? `. ${u.detail}` : ""}
                      </span>
                    </span>
                    <span className="hidden text-[12.5px] text-ink-3 sm:inline">{u.kind === "live" ? "Live class" : "Private lesson"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="flex items-center gap-2 border-t border-line px-5 py-3 text-[13px] text-ink-3">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            Times in your time zone
          </p>
        </Card>
      </div>
    </Screen>
  );
}

