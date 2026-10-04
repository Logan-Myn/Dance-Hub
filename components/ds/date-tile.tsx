import { cn } from "@/lib/utils";

/**
 * Calendar-style month/day tile in `timeZone` (the viewer's), with a fixed
 * locale, so server and browser render the same day.
 * Decorative (aria-hidden): callers must also render the date as text.
 */
export function DateTile({
  date,
  timeZone,
  variant = "brand",
  showWeekday = false,
  className,
}: {
  date: Date | string | number;
  timeZone: string;
  variant?: "brand" | "live";
  showWeekday?: boolean;
  className?: string;
}) {
  const d = new Date(date);
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone });
  const day = d.toLocaleDateString("en-US", { day: "numeric", timeZone });
  const weekday = d.toLocaleDateString("en-US", { weekday: "short", timeZone });
  return (
    <div
      aria-hidden="true"
      className={cn("w-[52px] shrink-0 overflow-hidden rounded-xl border border-line bg-surface text-center", className)}
    >
      <span
        className={cn(
          "block py-1 text-[11px] font-semibold tracking-wide text-white",
          variant === "live" ? "bg-live" : "bg-brand"
        )}
      >
        {month}
      </span>
      <span className="block py-1.5 font-display text-[22px] font-semibold leading-none tabular-nums text-ink">{day}</span>
      {showWeekday && <span className="block pb-1.5 text-[11px] font-semibold text-ink-3">{weekday}</span>}
    </div>
  );
}
