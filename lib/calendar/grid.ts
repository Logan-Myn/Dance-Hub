import { formatInTimeZone } from "date-fns-tz";
import { dateKeyInTz } from "@/lib/calendar-week";

export interface GridInput {
  id: string;
  startsAt: string;
  durationMinutes: number;
}

export interface Placed<T extends GridInput> {
  item: T;
  dayKey: string;
  /** Hours from the top of the grid. */
  top: number;
  /** Height in hours (clipped to the grid). */
  height: number;
  col: number;
  cols: number;
}

/** Wall-clock hour as a fraction (19.5 = 19:30) in `tz`. */
export function hourOfDay(instant: string | Date, tz: string): number {
  const [h, m] = formatInTimeZone(new Date(instant), tz, "H:m").split(":").map(Number);
  return h + m / 60;
}

/**
 * The hours to show: one hour either side of the busy span, at least six
 * rows, 9 to 21 when the week is empty; the full day (from 6) on request.
 */
export function visibleHours(items: GridInput[], tz: string, fullDay: boolean): { minH: number; maxH: number } {
  let minH = 24;
  let maxH = 0;
  for (const it of items) {
    const h = hourOfDay(it.startsAt, tz);
    minH = Math.min(minH, h);
    maxH = Math.max(maxH, h + it.durationMinutes / 60);
  }
  if (!items.length) {
    minH = 9;
    maxH = 21;
  }
  minH = Math.max(0, Math.floor(minH) - 1);
  maxH = Math.min(24, Math.ceil(maxH) + 1);
  while (maxH - minH < 6) {
    if (minH > 0) minH--;
    if (maxH - minH < 6 && maxH < 24) maxH++;
    if (minH === 0 && maxH === 24) break;
  }
  if (fullDay) {
    minH = 0;
    maxH = 24;
  }
  return { minH, maxH };
}

/** Events of the given days placed on the grid, overlaps side by side. */
export function placeEvents<T extends GridInput>(items: T[], dayKeys: string[], tz: string, minH: number, maxH: number): Placed<T>[] {
  const out: Placed<T>[] = [];
  for (const day of dayKeys) {
    const list = items
      .filter((it) => dateKeyInTz(it.startsAt, tz) === day)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const spans = list.map((item) => {
      const s = new Date(item.startsAt).getTime();
      return { item, s, e: s + item.durationMinutes * 60_000, col: 0 };
    });
    for (const sp of spans) {
      let c = 0;
      while (spans.some((o) => o !== sp && o.col === c && spans.indexOf(o) < spans.indexOf(sp) && o.s < sp.e && o.e > sp.s)) c++;
      sp.col = c;
    }
    for (const sp of spans) {
      const overlapping = spans.filter((o) => o.s < sp.e && o.e > sp.s);
      const cols = Math.max(...overlapping.map((o) => o.col)) + 1;
      const top = hourOfDay(sp.item.startsAt, tz) - minH;
      out.push({
        item: sp.item,
        dayKey: day,
        top,
        height: Math.max(0.25, Math.min(sp.item.durationMinutes / 60, maxH - minH - top)),
        col: sp.col,
        cols,
      });
    }
  }
  return out;
}

/** Items grouped by calendar day in `tz`, in order. */
export function groupByDay<T extends GridInput>(items: T[], tz: string): Array<{ dayKey: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const it of [...items].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const k = dateKeyInTz(it.startsAt, tz);
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  return Array.from(groups, ([dayKey, list]) => ({ dayKey, items: list }));
}
