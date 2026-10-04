"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { CalendarDays, ChevronLeft, ChevronRight, Globe, List, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY } from "@/components/community-feed/feed-header";
import { FeedError } from "@/components/community-feed/feed-states";
import { AgendaList } from "@/components/community-calendar/agenda-list";
import { EventDialog } from "@/components/community-calendar/event-dialog";
import { clock, city } from "@/components/community-calendar/format";
import { itemState } from "@/components/community-calendar/item-state";
import { NextUpCard } from "@/components/community-calendar/next-up-card";
import { ScheduleDialog, type ScheduleInput } from "@/components/community-calendar/schedule-dialog";
import { WeekGrid } from "@/components/community-calendar/week-grid";
import type { CalendarCtx, CalendarItem } from "@/components/community-calendar/types";
import { useNow } from "@/hooks/use-now";
import { useViewerTimeZone } from "@/hooks/use-viewer-time-zone";
import {
  dateKeyInTz,
  defaultClassStart,
  formatDayKey,
  rangeContains,
  weekDayKeys,
  weekRangeUtc,
  weekStartKey,
} from "@/lib/calendar-week";
import { weeklyStarts } from "@/lib/calendar/series";
import { sameUtcOffset } from "@/lib/time/format";
import { cn } from "@/lib/utils";

type View = "week" | "list";
type Filter = "all" | "class" | "lesson";

const narrowQuery = "(max-width: 759px)";
const subscribeNarrow = (cb: () => void) => {
  const mq = window.matchMedia(narrowQuery);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

async function fetchItems(url: string): Promise<CalendarItem[]> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export interface CalendarClientProps {
  slug: string;
  teacherName: string;
  isOwner: boolean;
  lessonsOn: boolean;
  initialItems: CalendarItem[];
  initialRange: { start: string; end: string };
  serverNow: number;
  viewerZone: string | null;
  classZone: string | null;
}

export default function CalendarClient({
  slug,
  teacherName,
  isOwner,
  lessonsOn,
  initialItems,
  initialRange,
  serverNow,
  viewerZone,
  classZone,
}: CalendarClientProps) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const now = useNow(60_000, serverNow) ?? new Date(serverNow);
  const yourZone = useViewerTimeZone(viewerZone);
  const narrow = useSyncExternalStore(subscribeNarrow, () => window.matchMedia(narrowQuery).matches, () => false);

  const [userView, setUserView] = useState<View | null>(null);
  const view: View = userView ?? (narrow ? "list" : "week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [zoneMode, setZoneMode] = useState<"yours" | "class">("yours");
  const [showPast, setShowPast] = useState(false);
  const [detail, setDetail] = useState<CalendarItem | null>(null);
  const [schedule, setSchedule] = useState<{ open: boolean; editing: CalendarItem | null; prefill: string }>({
    open: false,
    editing: null,
    prefill: "",
  });

  const zonesDiffer = !!classZone && !sameUtcOffset(now, yourZone, classZone);
  const timeZone = zonesDiffer && zoneMode === "class" ? classZone! : yourZone;
  const otherZone = zonesDiffer ? (timeZone === yourZone ? classZone : yourZone) : null;
  const ctx: CalendarCtx = { slug, isOwner, teacherName, now, timeZone, otherZone };

  // The week on screen, in the zone times are shown in.
  const todayKey = dateKeyInTz(now, timeZone);
  const startKey = weekStartKey(todayKey, weekOffset);
  const days = weekDayKeys(startKey);
  const weekRange = weekRangeUtc(startKey, timeZone);
  const initial = { start: new Date(initialRange.start), end: new Date(initialRange.end) };
  const needsFetch = view === "week" && !rangeContains(initial, weekRange);
  const key = needsFetch
    ? `/api/community/${encodeURIComponent(slug)}/calendar?start=${weekRange.start.toISOString()}&end=${weekRange.end.toISOString()}`
    : null;
  const { data: fetched, error, isLoading, mutate: retry } = useSWR<CalendarItem[]>(key, fetchItems, { keepPreviousData: true });
  const visible = useMemo(
    () => (needsFetch ? fetched ?? [] : initialItems).filter((i) => filter === "all" || i.kind === filter),
    [needsFetch, fetched, initialItems, filter]
  );
  const upcoming = (k: Filter) =>
    initialItems.filter((i) => (k === "all" || i.kind === k) && itemState(i, now) !== "canceled" && itemState(i, now) !== "past").length;
  const next = initialItems
    .filter((i) => {
      const st = itemState(i, now);
      return st !== "canceled" && st !== "past";
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];

  // ← → move weeks, T jumps to today.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (view !== "week") return;
      if (e.key === "ArrowLeft") setWeekOffset((w) => w - 1);
      else if (e.key === "ArrowRight") setWeekOffset((w) => w + 1);
      else if (e.key === "t" || e.key === "T") setWeekOffset(0);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  const refresh = () => {
    router.refresh();
    mutate((k) => typeof k === "string" && k.includes("/calendar?"));
  };

  const errorText = async (res: Response) => {
    const data = await res.json().catch(() => null);
    if (res.status === 409 && data?.conflict_at) {
      return `${data.error} The other class is at ${clock(data.conflict_at, timeZone)} on ${new Date(data.conflict_at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone })}.`;
    }
    return data?.error || "Couldn't save the class. Try again.";
  };

  const base = `/api/community/${encodeURIComponent(slug)}/live-classes`;

  const submitSchedule = async (input: ScheduleInput): Promise<string | null> => {
    const editing = schedule.editing?.kind === "class" ? schedule.editing : null;
    const res = await fetch(editing ? `${base}/${editing.id}` : base, {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        description: input.description,
        scheduled_start_time: input.startsAt,
        duration_minutes: input.durationMinutes,
        enable_recording: input.enableRecording,
        ...(editing ? {} : { repeat_weeks: input.repeatWeeks, time_zone: timeZone }),
      }),
    });
    if (!res.ok) return errorText(res);
    const weekday = new Date(input.startsAt).toLocaleDateString("en-GB", { weekday: "long", timeZone });
    toast.success(
      editing
        ? "Class updated"
        : input.repeatWeeks > 1
          ? `Scheduled ${input.repeatWeeks} classes, every ${weekday} at ${clock(input.startsAt, timeZone)}`
          : "Class scheduled"
    );
    setSchedule((s) => ({ ...s, open: false, editing: null }));
    setDetail(null);
    // Show the week of the (first) class.
    const target = weekStartKey(dateKeyInTz(input.startsAt, timeZone));
    const diff = Math.round((Date.parse(`${target}T12:00:00Z`) - Date.parse(`${weekStartKey(todayKey)}T12:00:00Z`)) / (7 * 86_400_000));
    setWeekOffset(diff);
    refresh();
    return null;
  };

  const updateStatus = async (item: CalendarItem, status: "cancelled" | "scheduled") => {
    const res = await fetch(`${base}/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast.error(await errorText(res));
      return;
    }
    toast.success(status === "cancelled" ? "Class canceled. It stays on the calendar, marked as canceled." : "Class restored");
    setDetail(null);
    refresh();
  };

  const repeatNextWeek = async (item: CalendarItem) => {
    if (item.kind !== "class") return;
    const start = weeklyStarts(item.startsAt, timeZone, 2)[1];
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: item.title,
        description: item.description ?? "",
        scheduled_start_time: start.toISOString(),
        duration_minutes: item.durationMinutes,
        enable_recording: item.enableRecording,
      }),
    });
    if (!res.ok) {
      toast.error(await errorText(res));
      return;
    }
    toast.success(`Added for ${new Date(start).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone })}`);
    setDetail(null);
    refresh();
  };

  const openSchedule = (prefill?: string) =>
    setSchedule({
      open: true,
      editing: null,
      prefill: prefill ?? defaultClassStart(weekOffset > 0 ? startKey : null, now, timeZone).toISOString(),
    });

  const rangeLabel = `${formatDayKey(days[0], "d MMM")} to ${formatDayKey(days[6], "d MMM yyyy")}`;
  const lessonLabel = isOwner ? "Private lessons" : "My private lessons";
  const emptyWeekText = filter === "lesson" ? "No private lessons this week." : "Nothing scheduled this week.";
  const nothingAtAll = initialItems.length === 0 && weekOffset === 0;

  return (
    <div className="mx-auto max-w-[1160px] px-4 pb-12 pt-4 sm:px-6 sm:pb-[72px] sm:pt-7">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-[1.1] tracking-[-0.015em] text-ink sm:text-[32px]">Calendar</h1>
          <p className="mt-1.5 text-[15px] text-ink-2 sm:text-[16px]">
            {lessonsOn ? "Live classes and your private lessons, shown in your time zone." : "Live classes, shown in your time zone."}
          </p>
        </div>
        {isOwner && (
          <button type="button" className={cn(BTN_PRIMARY, "h-11 px-[18px] text-[15px]")} onClick={() => openSchedule()}>
            <Plus aria-hidden="true" />
            Schedule class
          </button>
        )}
      </div>

      {next && <NextUpCard item={next} ctx={ctx} onDetails={() => setDetail(next)} />}

      {nothingAtAll ? (
        <div className="mt-6 flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
          <div className="mb-1 grid h-16 w-16 place-items-center rounded-[18px] bg-brand-soft text-brand-ink">
            <CalendarDays className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="font-display text-[20px] font-semibold text-ink">{isOwner ? "Schedule your first class" : "No classes scheduled yet"}</h2>
          <p className="max-w-[48ch] text-[15px] text-ink-2">
            {isOwner
              ? "Most communities run one class a week at the same time. Set it up once with Repeat, and members see every date here."
              : `When ${teacherName} schedules a live class, it shows up here with a join button when it starts.`}
          </p>
          {isOwner && (
            <button type="button" className={cn(BTN_PRIMARY, "mt-1.5")} onClick={() => openSchedule()}>
              <Plus aria-hidden="true" />
              Schedule class
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div className="flex items-center gap-1.5">
              {view === "week" ? (
                <>
                  <button type="button" aria-label="Previous week" className={cn(BTN_GHOST, "w-[38px] px-0")} onClick={() => setWeekOffset((w) => w - 1)}>
                    <ChevronLeft aria-hidden="true" />
                  </button>
                  <button type="button" className={cn(BTN_SECONDARY, "h-[34px] px-3 text-[13.5px]")} onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>
                    Today
                  </button>
                  <button type="button" aria-label="Next week" className={cn(BTN_GHOST, "w-[38px] px-0")} onClick={() => setWeekOffset((w) => w + 1)}>
                    <ChevronRight aria-hidden="true" />
                  </button>
                  <h2 aria-live="polite" className="ml-1.5 whitespace-nowrap font-display text-[17px] font-semibold tabular-nums text-ink sm:text-[19px]">
                    {rangeLabel}
                  </h2>
                </>
              ) : (
                <h2 className="font-display text-[19px] font-semibold text-ink">Upcoming</h2>
              )}
            </div>
            <div role="group" aria-label="View" className="inline-flex shrink-0 rounded-[10px] bg-surface-2 p-[3px]">
              {(
                [
                  ["week", "Week", CalendarDays],
                  ["list", "List", List],
                ] as const
              ).map(([v, label, Icon]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setUserView(v)}
                  className={cn(
                    "inline-flex h-[30px] items-center gap-1.5 rounded-[7px] px-[11px] text-[13.5px] transition-colors",
                    view === v ? "bg-surface font-semibold text-ink shadow-card" : "font-medium text-ink-2 hover:text-ink"
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
            {lessonsOn ? (
              <div role="group" aria-label="Filter" className="scrollbar-hide flex min-w-0 gap-1.5 overflow-x-auto">
                {(
                  [
                    ["all", "Everything", null],
                    ["class", "Live classes", <span key="k" aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] bg-brand" />],
                    ["lesson", lessonLabel, <span key="k" aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] border-2 border-brand bg-surface" />],
                  ] as const
                ).map(([k, label, keyEl]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={filter === k}
                    onClick={() => setFilter(k)}
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-[13.5px] transition-colors",
                      filter === k ? "border-brand-line bg-brand-soft font-semibold text-brand-ink" : "border-line bg-surface font-medium text-ink-2 hover:border-line-strong hover:text-ink"
                    )}
                  >
                    {keyEl}
                    {label}
                    <span className={cn("text-[12.5px] tabular-nums", filter === k ? "opacity-80" : "text-ink-3")}>{upcoming(k)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <span />
            )}
            <div className="inline-flex items-center gap-2 text-[13px] text-ink-2">
              <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
              {zonesDiffer ? (
                <>
                  <span>Times in</span>
                  <div role="group" aria-label="Time zone" className="inline-flex rounded-[10px] bg-surface-2 p-[3px]">
                    {(
                      [
                        ["yours", `Yours (${city(yourZone)})`],
                        ["class", `Class time (${city(classZone!)})`],
                      ] as const
                    ).map(([m, label]) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={zoneMode === m}
                        onClick={() => setZoneMode(m)}
                        className={cn(
                          "h-7 rounded-[7px] px-2.5 text-[13px] transition-colors",
                          zoneMode === m ? "bg-surface font-semibold text-ink shadow-card" : "font-medium text-ink-2 hover:text-ink"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <span>
                  Times in your time zone ({city(yourZone)}){classZone ? ", same as class time" : ""}
                </span>
              )}
            </div>
          </div>

          {needsFetch && error && !fetched ? (
            <FeedError
              className="mt-3.5"
              title="The calendar didn't load"
              text="The connection dropped while loading this week's classes."
              onRetry={() => retry()}
            />
          ) : needsFetch && isLoading && !fetched ? (
            <div aria-busy="true" className="mt-3.5 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
              <span className="sr-only">Loading the calendar</span>
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className="block h-10 animate-pulse rounded-md bg-surface-3 motion-reduce:animate-none" style={{ width: `${100 - (i % 3) * 12}%` }} />
              ))}
            </div>
          ) : view === "week" ? (
            <WeekGrid
              days={days}
              items={visible}
              ctx={ctx}
              emptyText={emptyWeekText}
              onOpen={setDetail}
              onAddAt={isOwner ? (iso) => openSchedule(iso) : undefined}
              onNextWeek={() => setWeekOffset((w) => w + 1)}
            />
          ) : (
            <AgendaList
              items={visible}
              ctx={ctx}
              showPast={showPast}
              onTogglePast={() => setShowPast((p) => !p)}
              onOpen={setDetail}
              emptyText={filter === "lesson" ? "You have no private lessons booked." : "No upcoming classes."}
              onShowEverything={filter !== "all" ? () => setFilter("all") : undefined}
            />
          )}
        </>
      )}

      <EventDialog
        key={detail?.id ?? "none"}
        item={detail}
        ctx={ctx}
        onClose={() => setDetail(null)}
        onEdit={(item) => {
          setDetail(null);
          setSchedule({ open: true, editing: item, prefill: item.startsAt });
        }}
        onRepeat={repeatNextWeek}
        onCancelClass={(item) => updateStatus(item, "cancelled")}
        onRestore={(item) => updateStatus(item, "scheduled")}
      />

      {isOwner && schedule.open && (
        <ScheduleDialog
          key={`${schedule.editing?.id ?? "new"}-${schedule.prefill}`}
          open
          onOpenChange={(open) => !open && setSchedule((s) => ({ ...s, open: false, editing: null }))}
          timeZone={timeZone}
          editing={schedule.editing?.kind === "class" ? schedule.editing : null}
          prefill={schedule.prefill}
          onSubmit={submitSchedule}
        />
      )}
    </div>
  );
}
