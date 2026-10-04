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
        {/* The overlay centers the dialog, so the dialog's own transform is free
            for its entrance (rise 12px and fade in, like the prototype). */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 grid place-items-center bg-[rgba(24,16,36,.52)] backdrop-blur-[2px] motion-safe:animate-scrim-in">
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => {
            // Esc in a reply box closes that box, not the post.
            const t = e.target as HTMLElement | null;
            if (t?.closest("[data-reply-box]")) e.preventDefault();
          }}
          onCloseAutoFocus={(e) => {
            // Back to the post's card when it is on the page (opened from search too).
            const link = document.querySelector<HTMLElement>(`#post-${CSS.escape(rest.thread.id)} a.post-link`);
            if (link) {
              e.preventDefault();
              link.focus();
            }
          }}
          onOpenAutoFocus={(e) => {
            if (rest.autoFocusReply) return;
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
          className="flex h-full w-full flex-col overflow-hidden bg-surface outline-none motion-safe:animate-sheet-in sm:h-auto sm:max-h-[min(88vh,920px)] sm:w-[min(720px,calc(100%-32px))] sm:rounded-[20px] sm:border sm:border-line sm:shadow-overlay sm:motion-safe:animate-dlg-in"
        >
          <DialogPrimitive.Title className="sr-only">{rest.thread.title}</DialogPrimitive.Title>
          <ThreadView {...rest} onClose={onClose} layout="modal" />
        </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
