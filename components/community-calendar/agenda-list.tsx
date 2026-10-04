"use client";

import { CalendarDays, Check, GraduationCap, Play, Rewind, Video } from "lucide-react";
import { Pill } from "@/components/ds/pill";
import { BTN_GHOST, BTN_SECONDARY } from "@/components/community-feed/feed-header";
import { dateKeyInTz } from "@/lib/calendar-week";
import { groupByDay } from "@/lib/calendar/grid";
import { startsIn } from "@/lib/time/format";
import { cn } from "@/lib/utils";
import { clock, dateLong, dayWord } from "./format";
import { PrimaryAction } from "./item-actions";
import { itemState, itemTitle } from "./item-state";
import type { CalendarCtx, CalendarItem } from "./types";

/** Upcoming items by day; past classes (with replays) on request. */
export function AgendaList({
  items,
  ctx,
  showPast,
  onTogglePast,
  onOpen,
  emptyText,
  onShowEverything,
}: {
  items: CalendarItem[];
  ctx: CalendarCtx;
  showPast: boolean;
  onTogglePast: () => void;
  onOpen: (item: CalendarItem) => void;
  emptyText: string;
  onShowEverything?: () => void;
}) {
  const now = ctx.now.getTime();
  const list = items.filter((i) => {
    const end = new Date(i.startsAt).getTime() + i.durationMinutes * 60_000;
    return showPast ? end > now - 15 * 86_400_000 : end > now || itemState(i, ctx.now) === "live";
  });
  const todayKey = dateKeyInTz(ctx.now, ctx.timeZone);

  if (list.length === 0) {
    return (
      <div className="mt-3.5 flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
        <div className="mb-1 grid h-16 w-16 place-items-center rounded-[18px] bg-brand-soft text-brand-ink">
          <CalendarDays className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="font-display text-[20px] font-semibold text-ink">Nothing coming up</h2>
        <p className="max-w-[48ch] text-[15px] text-ink-2">{emptyText}</p>
        <div className="mt-1.5 flex flex-wrap justify-center gap-2">
          {!showPast && (
            <button type="button" className={BTN_SECONDARY} onClick={onTogglePast}>
              <Rewind aria-hidden="true" />
              Show past classes
            </button>
          )}
          {onShowEverything && (
            <button type="button" className={BTN_SECONDARY} onClick={onShowEverything}>
              Show everything
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3.5 flex flex-col gap-[22px]">
      <button type="button" className={cn(BTN_GHOST, "h-8 self-start px-2.5 text-[13px]")} onClick={onTogglePast}>
        {!showPast && <Rewind aria-hidden="true" />}
        {showPast ? "Hide past classes" : "Show past classes and replays"}
      </button>
      {groupByDay(list, ctx.timeZone).map(({ dayKey, items: dayItems }) => (
        <section key={dayKey} className="flex flex-col gap-2">
          <h3 className={cn("flex items-baseline gap-2 font-display text-[15px] font-semibold", dayKey === todayKey ? "text-brand-ink" : "text-ink")}>
            {dayWord(dayItems[0].startsAt, ctx.now, ctx.timeZone)}
            <small className="font-sans text-[13px] font-medium text-ink-3">{dateLong(dayItems[0].startsAt, ctx.timeZone)}</small>
          </h3>
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {dayItems.map((item) => {
              const st = itemState(item, ctx.now);
              return (
                <div key={item.id} className="relative grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface-2 sm:grid-cols-[92px_minmax(0,1fr)_auto]">
                  <button
                    type="button"
                    onClick={() => onOpen(item)}
                    aria-label={`Details for ${itemTitle(item)}`}
                    className="absolute inset-0 z-[1] rounded-[inherit] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                  />
                  <div>
                    <strong className="block text-[15px] tabular-nums text-ink">{clock(item.startsAt, ctx.timeZone)}</strong>
                    <span className="text-[12.5px] text-ink-3">{item.durationMinutes} min</span>
                  </div>
                  <div className="flex min-w-0 flex-col gap-[5px]">
                    <strong
                      className={cn(
                        "font-display text-[16px] font-semibold leading-[1.3]",
                        st === "canceled" ? "text-ink-3 line-through" : st === "past" ? "text-ink-2" : "text-ink"
                      )}
                    >
                      {itemTitle(item)}
                    </strong>
                    <div className="flex flex-wrap gap-1.5">
                      {item.kind === "lesson" ? (
                        <Pill variant="brand">
                          <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                          Private lesson
                        </Pill>
                      ) : (
                        <Pill>
                          <Video className="h-3.5 w-3.5" aria-hidden="true" />
                          Live class
                        </Pill>
                      )}
                      {st === "live" && <Pill variant="live">Live now</Pill>}
                      {st === "soon" && <Pill variant="brand">Starts {startsIn(item.startsAt, ctx.now)}</Pill>}
                      {st === "canceled" && <Pill variant="muted">Canceled</Pill>}
                      {st === "past" && item.kind === "class" && item.replay && (
                        <Pill variant={item.replay.watched ? "ok" : "neutral"}>
                          {item.replay.watched ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
                          {item.replay.watched ? "Watched" : "Replay in Classroom"}
                        </Pill>
                      )}
                    </div>
                  </div>
                  <div className="relative z-[2] col-span-2 flex items-center gap-1.5 sm:col-span-1">
                    {(st === "live" || st === "soon" || (st === "past" && item.kind === "class" && item.replay)) && (
                      <PrimaryAction item={item} ctx={ctx} size="sm" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
