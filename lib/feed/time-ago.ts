const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then a date
 * ("12 Sep", or "12 Sep 2025" in another year) in `timeZone`.
 */
export function timeAgo(instant: Date | string, now: Date, timeZone: string): string {
  const d = new Date(instant);
  const diff = now.getTime() - d.getTime();
  if (diff < MIN) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MIN)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const part = (x: Date, o: Intl.DateTimeFormatOptions) => x.toLocaleDateString("en-US", { ...o, timeZone });
  const year = part(d, { year: "numeric" });
  return `${part(d, { day: "numeric" })} ${part(d, { month: "short" })}${year === part(now, { year: "numeric" }) ? "" : ` ${year}`}`;
}

/** "Sunday 5 October 2026 at 19:00", for tooltips. */
export function fullDateTime(instant: Date | string, timeZone: string): string {
  const d = new Date(instant);
  const date = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
  return `${date} at ${time}`;
}
