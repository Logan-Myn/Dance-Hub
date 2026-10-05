"use client";

import { cn } from "@/lib/utils";

/** Sticky bar at the bottom of a form with unsaved changes. */
export function SaveBar({
  show,
  saving,
  onSave,
  onDiscard,
  message = "You have unsaved changes",
  saveLabel = "Save changes",
}: {
  show: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  message?: string;
  saveLabel?: string;
}) {
  if (!show) return null;
  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      className={cn(
        "sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-20 mt-4 flex flex-wrap items-center gap-2.5 rounded-[14px] bg-ink py-2.5 pl-4 pr-3 text-surface shadow-overlay md:bottom-4",
        "motion-safe:animate-pop-in"
      )}
    >
      <strong className="mr-auto text-[14px] font-semibold">{message}</strong>
      <button
        type="button"
        onClick={onDiscard}
        disabled={saving}
        className="inline-flex h-9 items-center rounded-[10px] border border-surface/35 px-3.5 text-[14px] font-semibold text-surface transition-colors hover:bg-surface/10 disabled:opacity-50"
      >
        Discard
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="inline-flex h-9 items-center rounded-[10px] bg-brand px-3.5 text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
      >
        {saving ? "Saving…" : saveLabel}
      </button>
    </div>
  );
}
