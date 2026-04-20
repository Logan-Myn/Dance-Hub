"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import ThreadView, { type ThreadViewProps } from "@/components/ThreadView";

type ThreadModalProps = Omit<ThreadViewProps, "layout" | "headerSlot"> & {
  isOpen: boolean;
};

export default function ThreadModal({
  isOpen,
  onClose,
  ...rest
}: ThreadModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[750px] p-0 max-h-[90vh] flex flex-col bg-card border-border/50 rounded-2xl overflow-hidden">
        <ThreadView {...rest} onClose={onClose} layout="modal" />
      </DialogContent>
    </Dialog>
  );
}
