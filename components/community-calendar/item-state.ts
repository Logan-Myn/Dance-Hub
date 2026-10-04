import { classState, lessonJoinable, type ClassState } from "@/lib/calendar/status";
import type { CalendarItem } from "./types";

/** Classes keep their own state; lessons are upcoming, live (room open) or past. */
export function itemState(item: CalendarItem, now: Date): ClassState {
  if (item.kind === "class") return classState(item, now);
  const end = new Date(item.startsAt).getTime() + item.durationMinutes * 60_000;
  if (now.getTime() >= end + 15 * 60_000) return "past";
  if (lessonJoinable(item.startsAt, item.durationMinutes, now)) return now.getTime() >= new Date(item.startsAt).getTime() ? "live" : "soon";
  return "upcoming";
}

export function itemTitle(item: CalendarItem): string {
  return item.kind === "lesson" ? `${item.title} with ${item.withName}` : item.title;
}

/** Where Join / Start goes, when the room is open. */
export function joinHref(item: CalendarItem): string {
  return item.kind === "class" ? `/live-class/${item.id}` : `/video-session/${item.id}`;
}
