import { hueForId } from "@/components/ds/initials-avatar";
import { cn } from "@/lib/utils";

/** The course's own cover, or a drawn one with its title when there is none. */
export function CourseCover({
  id,
  title,
  coverUrl,
  caption,
  className,
}: {
  id: string;
  title: string;
  coverUrl: string | null;
  caption?: string;
  className?: string;
}) {
  if (coverUrl) {
    return <img src={coverUrl} alt="" className={cn("block h-full w-full object-cover", className)} />;
  }
  const h = hueForId(id);
  return (
    <div
      aria-hidden="true"
      className={cn("relative flex h-full w-full flex-col justify-end gap-1 overflow-hidden px-5 py-[18px] text-brand-ink", className)}
      style={{
        background: `radial-gradient(70% 90% at 85% 15%, hsl(${h} 70% 70% / .45), transparent 70%), radial-gradient(60% 80% at 10% 100%, hsl(${h + 30} 70% 65% / .3), transparent 70%), rgb(var(--ds-brand-soft))`,
      }}
    >
      <span
        className="pointer-events-none absolute inset-0 opacity-[.12] [mask-image:linear-gradient(200deg,#000,transparent_65%)]"
        style={{ backgroundImage: "radial-gradient(currentColor 1px, transparent 1.4px)", backgroundSize: "16px 16px" }}
      />
      <b className="relative max-w-[14ch] font-display text-[26px] font-semibold leading-[1.05] tracking-[-0.01em] text-ink">{title}</b>
      {caption && <span className="relative text-[13px] font-semibold">{caption}</span>}
    </div>
  );
}

/** Progress bar; green when done. */
export function ProgressBar({ value, done = false, className, label }: { value: number; done?: boolean; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span
      role={label ? "progressbar" : undefined}
      aria-label={label}
      aria-valuenow={label ? pct : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      aria-hidden={label ? undefined : true}
      className={cn("block h-1.5 overflow-hidden rounded-full bg-surface-3", className)}
    >
      <span className={cn("block h-full rounded-full transition-[width] duration-500", done ? "bg-ok" : "bg-brand")} style={{ width: `${pct}%` }} />
    </span>
  );
}
