"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dialog in the redesign style: centered by the overlay (so the entrance is a
 * short rise and fade), a title row with Close, and a scrolling body. On
 * phones it sits at the bottom like a sheet.
 */
export function AppDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  leading,
  width = 560,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Shown before the title, like a logo mark. */
  leading?: React.ReactNode;
  width?: number;
  className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 grid items-end overflow-y-auto bg-[rgba(24,16,36,.52)] backdrop-blur-[2px] motion-safe:animate-scrim-in sm:place-items-center sm:p-4">
          <DialogPrimitive.Content
            className={cn(
              "flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[20px] border border-line bg-surface text-ink shadow-overlay outline-none motion-safe:animate-sheet-in sm:max-h-[calc(100vh-32px)] sm:rounded-[20px] sm:motion-safe:animate-dlg-in",
              className
            )}
            style={{ maxWidth: width }}
          >
            <div className="flex items-start gap-3 pb-2 pl-[22px] pr-3.5 pt-4">
              {leading && <div className="shrink-0 pt-1">{leading}</div>}
              <div className="min-w-0 flex-1 pt-1">
                <DialogPrimitive.Title className="font-display text-[20px] font-semibold leading-tight text-ink">{title}</DialogPrimitive.Title>
                {description ? (
                  <DialogPrimitive.Description className="mt-1 text-[14px] text-ink-2">{description}</DialogPrimitive.Description>
                ) : (
                  <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
                )}
              </div>
              <DialogPrimitive.Close
                className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-[22px] pb-[22px] pt-2">{children}</div>
            {footer && (
              <div className="flex flex-wrap justify-end gap-2 border-t border-line px-[22px] py-3.5 pb-[calc(14px+env(safe-area-inset-bottom))] sm:pb-3.5">
                {footer}
              </div>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const FIELD_LABEL = "mb-1.5 block text-[13px] font-semibold text-ink-2";
export const FIELD_INPUT =
  "w-full rounded-[10px] border border-line bg-surface px-3 py-2.5 text-[15px] text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-3 focus:border-brand focus:shadow-[0_0_0_3px_rgb(var(--ds-brand)/0.18)] aria-[invalid=true]:border-live";
export const FIELD_ERROR = "mt-1.5 text-[13px] font-medium text-live";
