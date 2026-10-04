import { Clock, GraduationCap, Video } from "lucide-react";
import { Pill } from "@/components/ds/pill";
import { startsIn } from "@/lib/time/format";
import { cn } from "@/lib/utils";
import { clock, city, dayWord, endOf } from "./format";
import { AddToCalendar, PrimaryAction } from "./item-actions";
import { itemState, itemTitle } from "./item-state";
import type { CalendarCtx, CalendarItem } from "./types";
import { BTN_GHOST } from "@/components/community-feed/feed-header";

function LiveDot() {
  return (
    <span aria-hidden="true" className="relative inline-flex h-[9px] w-[9px] shrink-0">
      <span className="absolute inset-0 animate-ping rounded-full bg-current motion-reduce:animate-none" />
      <span className="relative h-[9px] w-[9px] rounded-full bg-current" />
    </span>
  );
}

/** The next class or private lesson, with its countdown and main action. */
export function NextUpCard({ item, ctx, onDetails }: { item: CalendarItem; ctx: CalendarCtx; onDetails: () => void }) {
  const st = itemState(item, ctx.now);
  const live = st === "live";
  const open = live || st === "soon";
  const end = endOf(item.startsAt, item.durationMinutes);
  const fmt = (o: Intl.DateTimeFormatOptions) => new Date(item.startsAt).toLocaleDateString("en-GB", { ...o, timeZone: ctx.timeZone });
  const startedMin = Math.max(0, Math.round((ctx.now.getTime() - new Date(item.startsAt).getTime()) / 60_000));

  return (
    <section
      aria-labelledby="next-up-title"
      className={cn(
        "mt-6 grid grid-cols-[56px_minmax(0,1fr)] items-start gap-x-4 gap-y-3.5 rounded-[20px] border bg-surface p-4 shadow-raised transition-colors sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:items-center sm:gap-5 sm:py-[18px] sm:pl-[18px] sm:pr-[22px]",
        live ? "border-live/55" : open ? "border-brand/55" : "border-line"
      )}
    >
      <div aria-hidden="true" className="w-14 overflow-hidden rounded-[14px] border border-line bg-surface text-center sm:w-16">
        <span className={cn("block py-1.5 text-[11.5px] font-semibold leading-none text-white", live ? "bg-live" : "bg-brand")}>{fmt({ month: "short" })}</span>
        <span className="block pb-[3px] pt-[7px] font-display text-[26px] font-semibold leading-none tabular-nums text-ink">{fmt({ day: "numeric" })}</span>
        <span className="block pb-1.5 text-[11.5px] font-semibold text-ink-3">{fmt({ weekday: "short" })}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className={cn("flex items-center gap-2 text-[13px] font-semibold", live ? "text-live" : "text-ink-2")}>
          {live ? <LiveDot /> : item.kind === "lesson" ? <GraduationCap className="h-4 w-4" aria-hidden="true" /> : <Video className="h-4 w-4" aria-hidden="true" />}
          {live ? "Happening now" : item.kind === "lesson" ? "Next up: your private lesson" : "Next live class"}
        </span>
        <h2 id="next-up-title" className="text-balance font-display text-[20px] font-semibold leading-tight text-ink">
          {itemTitle(item)}
        </h2>
        <p className="text-[15px] tabular-nums text-ink">
          {dayWord(item.startsAt, ctx.now, ctx.timeZone)}, {clock(item.startsAt, ctx.timeZone)} to {clock(end, ctx.timeZone)}
          {ctx.otherZone && (
            <small className="text-[13px] text-ink-3">
              {" "}
              ({clock(item.startsAt, ctx.otherZone)} in {city(ctx.otherZone)})
            </small>
          )}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Pill variant={live ? "live" : open ? "brand" : "neutral"}>
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {live ? `Started ${startedMin} min ago` : `Starts ${startsIn(item.startsAt, ctx.now)}`}
          </Pill>
          {item.kind === "class" && item.enableRecording && (
            <Pill>
              <Video className="h-3.5 w-3.5" aria-hidden="true" />
              Recorded
            </Pill>
          )}
          {item.kind === "lesson" && item.pricePaid != null && <Pill variant="ok">Paid €{item.pricePaid}</Pill>}
        </div>
      </div>
      <div className="col-span-2 flex min-w-0 flex-col gap-2 sm:col-span-1 sm:min-w-[210px]">
        <PrimaryAction item={item} ctx={ctx} onDetails={onDetails} size="lg" />
        <div className="flex gap-1.5">
          <AddToCalendar item={item} ctx={ctx} className="h-8 flex-1 px-2.5 text-[13px]" />
          <button type="button" onClick={onDetails} className={cn(BTN_GHOST, "h-8 flex-1 px-2.5 text-[13px]")}>
            Details
          </button>
        </div>
      </div>
    </section>
  );
}
