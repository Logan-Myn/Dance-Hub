"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

/** In-page confirmation, used instead of window.confirm. Focuses Cancel. */
export function InlineConfirm({
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  destructive = true,
  busy = false,
}: {
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
  busy?: boolean;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);
  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={children ? bodyId : undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border p-3",
        destructive ? "border-live/35 bg-live-soft" : "border-brand-line bg-brand-soft"
      )}
    >
      <p className="text-sm text-ink">
        <strong id={titleId}>{title}</strong>
        {children ? <> <span id={bodyId}>{children}</span></> : null}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          className="h-8 rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-surface-2"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={cn(
            "h-8 rounded-lg px-3 text-[13px] font-semibold text-white disabled:opacity-50",
            destructive ? "bg-live hover:bg-live/90" : "bg-brand hover:bg-brand-hover"
          )}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
