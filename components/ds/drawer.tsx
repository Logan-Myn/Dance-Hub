"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Side panel over the page (full width on phones). */
export function Drawer({
  open,
  onOpenChange,
  title,
  children,
  width = 440,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  width?: number;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(24,16,36,.42)] motion-safe:animate-scrim-in" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-surface text-ink shadow-overlay outline-none motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-300"
          style={{ maxWidth: width }}
        >
          <div className="flex items-center gap-3 border-b border-line py-3 pl-5 pr-3">
            <DialogPrimitive.Title className="min-w-0 flex-1 font-display text-[16px] font-semibold text-ink">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            <DialogPrimitive.Close
              className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className={cn("flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-5")}>{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
