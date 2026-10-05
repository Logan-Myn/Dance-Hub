"use client";

import { cn } from "@/lib/utils";

/** On/off switch. The label is the visible text next to it (or aria-label when there's none). */
export function Switch({
  checked,
  onChange,
  label,
  hideLabel = false,
  ariaLabel,
  disabled = false,
  id,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hideLabel?: boolean;
  /** Accessible name when the visible label alone doesn't say what it controls. */
  ariaLabel?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? (hideLabel ? label : undefined)}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex items-center gap-2.5 rounded-full text-left text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        checked ? "text-ink" : "text-ink-2",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-brand" : "bg-line-strong",
          "after:absolute after:left-[3px] after:top-[3px] after:h-4 after:w-4 after:rounded-full after:bg-surface after:shadow-card after:transition-transform after:duration-200",
          checked && "after:translate-x-4"
        )}
      />
      {!hideLabel && <span>{label}</span>}
    </button>
  );
}
