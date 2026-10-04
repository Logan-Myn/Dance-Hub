import { cn } from "@/lib/utils";

export type PillVariant = "neutral" | "brand" | "ok" | "warn" | "live" | "muted";

const VARIANTS: Record<PillVariant, string> = {
  neutral: "bg-surface-2 text-ink-2",
  brand: "bg-brand-soft text-brand-ink",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  live: "bg-live-soft text-live",
  muted: "border border-dashed border-line-strong text-ink-3",
};

export function Pill({
  variant = "neutral",
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: PillVariant }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-semibold",
        VARIANTS[variant],
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
