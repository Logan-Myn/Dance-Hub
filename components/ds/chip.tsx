import { cn } from "@/lib/utils";

export interface ChipProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  pressed: boolean;
  count?: number;
  dotColor?: string;
}

export function Chip({ label, pressed, count, dotColor, className, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "inline-flex h-[34px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-sm font-medium transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        pressed
          ? "border-brand-line bg-brand-soft font-semibold text-brand-ink"
          : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
        className
      )}
      {...rest}
    >
      {dotColor && (
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
      )}
      {label}
      {count !== undefined && (
        <span className={cn("text-[12.5px] tabular-nums", pressed ? "opacity-80" : "text-ink-3")}>{count}</span>
      )}
    </button>
  );
}
