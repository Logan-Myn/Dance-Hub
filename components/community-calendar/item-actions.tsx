import Link from "next/link";
import { CalendarPlus, GraduationCap, Pencil, Play, Video } from "lucide-react";
import { BTN_LIVE, BTN_PRIMARY, BTN_SECONDARY } from "@/components/community-feed/feed-header";
import { communityPath } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";
import { itemState, joinHref } from "./item-state";
import type { CalendarCtx, CalendarItem } from "./types";

const REPLAYS = "live-class-replays";

/** The one main action for an item in its current state, or null. */
export function PrimaryAction({
  item,
  ctx,
  onDetails,
  size = "md",
}: {
  item: CalendarItem;
  ctx: CalendarCtx;
  onDetails?: () => void;
  size?: "md" | "lg" | "sm";
}) {
  const st = itemState(item, ctx.now);
  const sz = size === "lg" ? "h-11 px-[18px] text-[15px]" : size === "sm" ? "h-8 px-2.5 text-[13px]" : "";
  if (st === "live" || st === "soon") {
    const label =
      item.kind === "class" && ctx.isOwner ? (st === "live" ? "Go to your class" : "Start class") : item.kind === "lesson" ? "Join lesson" : "Join class";
    return (
      <Link href={joinHref(item)} className={cn(st === "live" ? BTN_LIVE : BTN_PRIMARY, sz)}>
        <Video aria-hidden="true" />
        {size === "sm" ? (ctx.isOwner && item.kind === "class" ? "Start" : "Join") : label}
      </Link>
    );
  }
  if (st === "past" && item.kind === "class" && item.replay) {
    return (
      <Link
        href={`${communityPath(ctx.slug, `/classroom/${REPLAYS}`)}?lesson=${item.replay.lessonId}`}
        className={cn(item.replay.watched ? BTN_SECONDARY : BTN_PRIMARY, sz)}
      >
        <Play aria-hidden="true" />
        {size === "sm" ? "Watch" : item.replay.watched ? "Watch again" : "Watch the replay"}
      </Link>
    );
  }
  if (st === "upcoming" && item.kind === "lesson") {
    return (
      <Link href={communityPath(ctx.slug, "/private-lessons")} className={cn(BTN_SECONDARY, sz)}>
        <GraduationCap aria-hidden="true" />
        Manage lesson
      </Link>
    );
  }
  if (st === "upcoming" && item.kind === "class" && ctx.isOwner && onDetails) {
    return (
      <button type="button" onClick={onDetails} className={cn(BTN_SECONDARY, sz)}>
        <Pencil aria-hidden="true" />
        Class details
      </button>
    );
  }
  return null;
}

/** "Add to calendar" for an upcoming class (an .ics file for the member's own app). */
export function AddToCalendar({ item, ctx, className }: { item: CalendarItem; ctx: CalendarCtx; className?: string }) {
  if (item.kind !== "class") return null;
  const st = itemState(item, ctx.now);
  if (st !== "upcoming" && st !== "soon") return null;
  return (
    <a href={`/api/community/${encodeURIComponent(ctx.slug)}/live-classes/${item.id}/ics`} download className={cn(BTN_SECONDARY, className)}>
      <CalendarPlus aria-hidden="true" />
      Add to calendar
    </a>
  );
}
