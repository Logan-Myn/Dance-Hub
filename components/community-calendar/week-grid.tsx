"use client";

import { useMemo, useState } from "react";
import { Play, Plus } from "lucide-react";
import { dateKeyInTz, formatDayKey, zonedTimeToUtc } from "@/lib/calendar-week";
import { placeEvents, visibleHours, hourOfDay } from "@/lib/calendar/grid";
import { cn } from "@/lib/utils";
import { clock, city, dayWord, endOf } from "./format";
import { itemState, itemTitle } from "./item-state";
import type { CalendarCtx, CalendarItem } from "./types";

const ROW = 56;
const hourLabel = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;

/** Week grid (one day at a time on phones), events placed by minute. */
export function WeekGrid({
  days,
  items,
  ctx,
  emptyText,
  onOpen,
  onAddAt,
  onNextWeek,
}: {
  days: string[];
  items: CalendarItem[];
  ctx: CalendarCtx;
  emptyText: string;
  onOpen: (item: CalendarItem) => void;
  /** Owner: schedule a class at this instant. */
  onAddAt?: (iso: string) => void;
  onNextWeek: () => void;
}) {
  const [fullDay, setFullDay] = useState(false);
  const todayKey = dateKeyInTz(ctx.now, ctx.timeZone);
  const inWeek = useMemo(() => items.filter((i) => days.includes(dateKeyInTz(i.startsAt, ctx.timeZone))), [items, days, ctx.timeZone]);
  const { minH, maxH } = visibleHours(inWeek, ctx.timeZone, fullDay);
  const rows = maxH - minH;
  const placed = placeEvents(inWeek, days, ctx.timeZone, minH, maxH);
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked && days.includes(picked) ? picked : days.includes(todayKey) ? todayKey : days.find((d) => inWeek.some((i) => dateKeyInTz(i.startsAt, ctx.timeZone) === d)) ?? days[0];
  const [ghost, setGhost] = useState<{ day: string; slot: number } | null>(null);
  const nowH = hourOfDay(ctx.now, ctx.timeZone);

  const slotAt = (e: React.MouseEvent<HTMLDivElement>) => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    return Math.max(0, Math.min(rows * 2 - 1, Math.floor(y / (ROW / 2))));
  };

  const column = (d: string, mobile: boolean) => {
    const past = d < todayKey;
    const canAdd = !!onAddAt && !past;
    const events = placed.filter((p) => p.dayKey === d);
    return (
      <div
        key={`${d}-${mobile ? "m" : "d"}`}
        className={cn(
          "relative border-l border-line",
          d === todayKey && "bg-brand-soft/45",
          past && "bg-surface-2/55",
          canAdd && "cursor-copy"
        )}
        style={{
          height: rows * ROW,
          backgroundImage: `linear-gradient(to bottom, rgb(var(--ds-line)) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--ds-line) / .55) 1px, transparent 1px)`,
          backgroundSize: `100% ${ROW}px, 100% ${ROW}px`,
          backgroundPosition: `0 0, 0 ${ROW / 2}px`,
        }}
        onMouseMove={canAdd ? (e) => setGhost({ day: d, slot: slotAt(e) }) : undefined}
        onMouseLeave={canAdd ? () => setGhost(null) : undefined}
        onClick={
          canAdd
            ? (e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                const slot = slotAt(e);
                const minutes = minH * 60 + slot * 30;
                onAddAt!(zonedTimeToUtc(d, Math.floor(minutes / 60), minutes % 60, ctx.timeZone).toISOString());
              }
            : undefined
        }
      >
        {canAdd && ghost?.day === d && !mobile && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[3px] z-[1] flex items-center gap-1 rounded-lg border-[1.5px] border-dashed border-brand bg-brand-soft/70 px-2 text-[12px] font-semibold text-brand-ink"
            style={{ top: ghost.slot * (ROW / 2), height: ROW - 3 }}
          >
            <Plus className="h-3.5 w-3.5" />
            {`${String(Math.floor((minH * 60 + ghost.slot * 30) / 60) % 24).padStart(2, "0")}:${ghost.slot % 2 ? "30" : "00"}`}
          </div>
        )}
        {events.map(({ item, top, height, col, cols }) => {
          const st = itemState(item, ctx.now);
          const short = height < 0.75;
          const end = endOf(item.startsAt, item.durationMinutes);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item)}
              aria-label={`${itemTitle(item)}, ${dayWord(item.startsAt, ctx.now, ctx.timeZone)} ${clock(item.startsAt, ctx.timeZone)} to ${clock(end, ctx.timeZone)}${st === "canceled" ? ", canceled" : st === "live" ? ", live now" : ""}`}
              className={cn(
                "absolute z-[2] flex overflow-hidden rounded-lg text-left text-[12px] leading-[1.3] transition-[box-shadow,transform] duration-150 hover:z-[3] hover:-translate-y-px hover:shadow-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
                short ? "flex-row items-center gap-1.5 px-2 py-0.5" : "flex-col gap-px px-2 py-[5px]",
                st === "canceled"
                  ? "border border-dashed border-line-strong bg-surface text-ink-3"
                  : st === "past"
                    ? "bg-surface-3 text-ink-2"
                    : st === "live"
                      ? "bg-live text-white"
                      : item.kind === "lesson"
                        ? "border-2 border-brand bg-surface px-1.5 py-[3px] text-ink"
                        : "bg-brand text-white"
              )}
              style={{
                top: top * ROW + 1,
                height: height * ROW - 3,
                left: `calc(3px + (100% - 6px) * ${col} / ${cols})`,
                width: `calc((100% - 6px) / ${cols} - 2px)`,
              }}
            >
              <strong className={cn("block overflow-hidden text-ellipsis text-[12.5px] font-semibold", short && "whitespace-nowrap", st === "canceled" && "line-through")}>
                {itemTitle(item)}
              </strong>
              {!short && (
                <span className="truncate tabular-nums opacity-90">
                  {clock(item.startsAt, ctx.timeZone)} to {clock(end, ctx.timeZone)}
                </span>
              )}
              {!short && st === "live" && <span className="text-[11px] font-bold">Live</span>}
              {!short && st === "canceled" && <span className="text-[11px] font-bold">Canceled</span>}
              {!short && st === "past" && item.kind === "class" && item.replay && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold">
                  <Play className="h-3 w-3" aria-hidden="true" />
                  Replay
                </span>
              )}
            </button>
          );
        })}
        {d === todayKey && nowH >= minH && nowH <= maxH && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-px right-0 z-[4] h-0.5 bg-live before:absolute before:-left-[5px] before:-top-1 before:h-2.5 before:w-2.5 before:rounded-full before:bg-live before:content-['']"
            style={{ top: (nowH - minH) * ROW }}
          />
        )}
      </div>
    );
  };

  const head = (d: string) => (
    <div key={`h-${d}`} className="flex flex-col items-center gap-0.5 border-b border-l border-line px-1.5 pb-2 pt-2.5 text-center">
      <span className={cn("text-[12px] font-semibold", d === todayKey ? "text-brand-ink" : "text-ink-3")}>{formatDayKey(d, "EEE")}</span>
      <span
        className={cn(
          "grid h-[34px] w-[34px] place-items-center rounded-full font-display text-[20px] font-semibold leading-none tabular-nums",
          d === todayKey ? "bg-brand text-white" : d < todayKey ? "text-ink-3" : "text-ink"
        )}
      >
        {formatDayKey(d, "d")}
      </span>
    </div>
  );

  return (
    <div className="relative mt-3.5 overflow-hidden rounded-2xl border border-line bg-surface">
      {/* Phones: pick a day */}
      <div role="group" aria-label="Choose a day" className="flex gap-1 border-b border-line p-2 md:hidden">
        {days.map((d) => {
          const n = inWeek.filter((i) => dateKeyInTz(i.startsAt, ctx.timeZone) === d).length;
          const on = d === day;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              aria-label={`${formatDayKey(d, "EEEE d MMMM")}, ${n} ${n === 1 ? "event" : "events"}`}
              onClick={() => setPicked(d)}
              className={cn("flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[10px] py-1.5", on && "bg-brand text-white")}
            >
              <span className={cn("text-[11.5px] font-semibold", on ? "text-white" : d === todayKey ? "text-brand-ink" : "text-ink-3")}>
                {formatDayKey(d, "EEEEE")}
              </span>
              <span className="font-display text-[18px] font-semibold leading-tight tabular-nums">{formatDayKey(d, "d")}</span>
              <span className="flex h-[5px] gap-[3px]">
                {Array.from({ length: Math.min(n, 3) }, (_, i) => (
                  <i key={i} className={cn("h-[5px] w-[5px] rounded-full", on ? "bg-white" : "bg-brand")} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="hidden md:grid" style={{ gridTemplateColumns: `58px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="flex items-end justify-center border-b border-line pb-2 text-[11.5px] text-ink-3">{city(ctx.timeZone)}</div>
        {days.map(head)}
      </div>
      <div className="grid md:hidden" style={{ gridTemplateColumns: "58px minmax(0, 1fr)" }}>
        <div className="border-b border-line" />
        {head(day)}
      </div>

      <div className="hidden md:grid" style={{ gridTemplateColumns: `58px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div aria-hidden="true" className="relative">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="relative" style={{ height: ROW }}>
              {i > 0 && <span className="absolute -top-2 right-2 bg-surface px-0.5 text-[11.5px] tabular-nums text-ink-3">{hourLabel(minH + i)}</span>}
            </div>
          ))}
        </div>
        {days.map((d) => column(d, false))}
      </div>
      <div className="grid md:hidden" style={{ gridTemplateColumns: "58px minmax(0, 1fr)" }}>
        <div aria-hidden="true" className="relative">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="relative" style={{ height: ROW }}>
              {i > 0 && <span className="absolute -top-2 right-2 bg-surface px-0.5 text-[11.5px] tabular-nums text-ink-3">{hourLabel(minH + i)}</span>}
            </div>
          ))}
        </div>
        {column(day, true)}
      </div>

      {inWeek.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[1] grid place-items-center">
          <p className="pointer-events-auto rounded-[10px] border border-line bg-surface px-4 py-2.5 text-[14px] text-ink-2 shadow-card">
            {emptyText}{" "}
            <button type="button" onClick={onNextWeek} className="font-semibold text-brand-ink hover:underline hover:underline-offset-[3px]">
              See next week
            </button>
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3.5 py-2.5 text-[13px] text-ink-3">
        <span>{fullDay ? "Showing the full day" : `Showing ${hourLabel(minH)} to ${hourLabel(maxH)}, the hours with classes this week`}</span>
        <button type="button" onClick={() => setFullDay((f) => !f)} className="font-semibold text-brand-ink hover:underline hover:underline-offset-[3px]">
          {fullDay ? "Show only busy hours" : "Show the full day"}
        </button>
      </div>
    </div>
  );
}
