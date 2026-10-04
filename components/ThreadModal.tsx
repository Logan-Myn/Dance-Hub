"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import ThreadView, { type ThreadViewProps } from "@/components/ThreadView";

type ThreadModalProps = Omit<ThreadViewProps, "layout" | "headerSlot"> & {
  isOpen: boolean;
};

/** A post in a dialog: 720px wide, a full-screen sheet on phones. */
export default function ThreadModal({ isOpen, onClose, ...rest }: ThreadModalProps) {
  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(24,16,36,.52)] backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            if (rest.autoFocusReply) return;
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-surface outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-6 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[min(88vh,920px)] sm:w-[min(720px,calc(100%-32px))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[20px] sm:border sm:border-line sm:shadow-overlay sm:data-[state=open]:slide-in-from-bottom-3"
        >
          <DialogPrimitive.Title className="sr-only">{rest.thread.title}</DialogPrimitive.Title>
          <ThreadView {...rest} onClose={onClose} layout="modal" />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
