"use client";

import Link from "next/link";
import { CalendarDays, CalendarPlus, Clock, Plus, Video } from "lucide-react";
import { DateTile } from "@/components/ds/date-tile";
import { formatTimeInZone, relativeDayWord, sameUtcOffset, startsIn, zoneAbbreviation } from "@/lib/time/format";
import { communityPath } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";
import { BTN_LIVE, BTN_PRIMARY, BTN_SECONDARY } from "../feed-header";
import type { UpcomingClass } from "../types";

const SOON_MS = 15 * 60_000;

function LiveDot() {
  return (
    <span aria-hidden="true" className="relative inline-flex h-2.5 w-2.5 shrink-0">
      <span className="absolute inset-0 animate-ping rounded-full bg-live motion-reduce:animate-none" />
      <span className="relative h-2.5 w-2.5 rounded-full bg-live" />
    </span>
  );
}

/** The next live class with a countdown, and Join once it starts. */
export function NextClassCard({
  slug,
  classes,
  now,
  timeZone,
  isOwner,
  className,
}: {
  slug: string;
  classes: UpcomingClass[];
  now: Date;
  timeZone: string;
  isOwner: boolean;
  className?: string;
}) {
  const live = (c: UpcomingClass) => {
    const start = new Date(c.startsAt).getTime();
    return c.status === "live" || (now.getTime() >= start && now.getTime() < start + c.durationMinutes * 60_000);
  };
  const ended = (c: UpcomingClass) => now.getTime() >= new Date(c.startsAt).getTime() + c.durationMinutes * 60_000 && c.status !== "live";
  const list = classes.filter((c) => !ended(c));
  const next = list[0];
  const then = list[1];
  const card = "relative flex flex-col gap-3.5 overflow-hidden rounded-2xl border bg-surface p-4 shadow-raised transition-colors";

  if (!next) {
    return (
      <div className={cn(card, "border-line", className)}>
        <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          Next live class
        </div>
        <p className="text-[14px] text-ink-2">
          {isOwner
            ? "No classes scheduled. Members see the next class here, with a countdown and a join button."
            : "No classes scheduled yet. When one is added, it shows up here."}
        </p>
        {isOwner ? (
          <Link href={communityPath(slug, "/calendar")} className={cn(BTN_PRIMARY, "w-full")}>
            <Plus aria-hidden="true" />
            Schedule a class
          </Link>
        ) : (
          <Link href={communityPath(slug, "/calendar")} className={cn(BTN_SECONDARY, "w-full")}>
            <CalendarDays aria-hidden="true" />
            Open calendar
          </Link>
        )}
      </div>
    );
  }

  const isLive = live(next);
  const msToStart = new Date(next.startsAt).getTime() - now.getTime();
  const isSoon = !isLive && msToStart <= SOON_MS;
  const time = formatTimeInZone(next.startsAt, timeZone, "en-GB");
  const teacherZone = next.teacherTimezone;
  const teacherLine =
    teacherZone && !sameUtcOffset(next.startsAt, timeZone, teacherZone)
      ? `${formatTimeInZone(next.startsAt, teacherZone, "en-GB")} ${zoneAbbreviation(next.startsAt, teacherZone)} for ${next.teacherName}`
      : null;

  return (
    <div className={cn(card, isLive ? "border-live/55" : isSoon ? "border-warn/55" : "border-line", className)}>
      <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
        {isLive ? <LiveDot /> : <CalendarDays className="h-4 w-4" aria-hidden="true" />}
        {isLive ? "Happening now" : "Next live class"}
      </div>
      <div className="flex items-start gap-3.5">
        <DateTile date={next.startsAt} timeZone={timeZone} variant={isLive ? "live" : "brand"} />
        <div className="min-w-0">
          <h3 className="font-display text-[17px] font-semibold leading-tight text-ink">{next.title}</h3>
          <p className="mt-[3px] text-[14px] text-ink-2">
            {relativeDayWord(next.startsAt, now, timeZone, "en-GB")} at {time}, {next.durationMinutes} min
            {teacherLine && <small className="block text-[12.5px] text-ink-3">{teacherLine}</small>}
          </p>
        </div>
      </div>
      <div
        className={cn(
          "flex items-center gap-2 rounded-[10px] px-3 py-2.5 text-[14px] font-semibold tabular-nums",
          isLive ? "bg-live-soft text-live" : isSoon ? "bg-warn-soft text-warn" : "bg-surface-2 text-ink"
        )}
      >
        {isLive ? <LiveDot /> : <Clock className={cn("h-4 w-4", isSoon ? "text-current" : "text-brand-ink")} aria-hidden="true" />}
        {isLive ? "Live now" : `Starts ${startsIn(next.startsAt, now)}`}
      </div>
      {isLive || isSoon ? (
        <Link href={`/live-class/${next.id}`} className={cn(isLive ? BTN_LIVE : BTN_PRIMARY, "w-full")}>
          <Video aria-hidden="true" />
          Join class
        </Link>
      ) : (
        <a
          href={`/api/community/${encodeURIComponent(slug)}/live-classes/${next.id}/ics`}
          download
          className={cn(BTN_SECONDARY, "w-full")}
        >
          <CalendarPlus aria-hidden="true" />
          Add to calendar
        </a>
      )}
      <div className="flex justify-between gap-2 border-t border-line pt-3 text-[13px] text-ink-3">
        <span className="min-w-0 truncate">
          {then
            ? `Then ${new Date(then.startsAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone })}: ${then.title}`
            : "Nothing else scheduled yet"}
        </span>
        <Link href={communityPath(slug, "/calendar")} className="shrink-0 font-semibold text-brand-ink hover:underline hover:underline-offset-[3px]">
          Calendar
        </Link>
      </div>
    </div>
  );
}
