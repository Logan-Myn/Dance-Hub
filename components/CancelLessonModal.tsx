"use client";

import * as React from "react";
import toast from "react-hot-toast";
import { AppDialog } from "@/components/ds/app-dialog";
import { BTN_GHOST, BTN_PRIMARY } from "@/components/community-feed/feed-header";
import { cn } from "@/lib/utils";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCancelled: () => void;
  bookingId: string;
  lessonTitle: string;
  scheduledAtIso: string | null;
  currency: string;
  role: "student" | "teacher";
  expectedRefundCents: number;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
};

function formatCurrency(amountMajor: string, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()];
  if (symbol) {
    return `${symbol}${amountMajor}`;
  }
  return `${currency} ${amountMajor}`;
}

export function CancelLessonModal({
  isOpen,
  onClose,
  onCancelled,
  bookingId,
  lessonTitle,
  currency,
  role,
  expectedRefundCents,
}: Props) {
  const [submitting, setSubmitting] = React.useState(false);
  const refundsFully = expectedRefundCents > 0;
  const refundMajor = (expectedRefundCents / 100).toFixed(2);
  const refundDisplay = formatCurrency(refundMajor, currency);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || body?.error || "Cancel failed");
      }
      const body = await res.json();
      const amountMajor = (body.refunded_amount_cents / 100).toFixed(2);
      const amountDisplay = formatCurrency(amountMajor, currency);
      toast.success(
        body.refunded_amount_cents > 0
          ? `Lesson canceled. ${amountDisplay} will be refunded.`
          : "Lesson canceled."
      );
      onCancelled();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Couldn't cancel the lesson. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const description = refundsFully
    ? role === "teacher"
      ? `The student gets ${refundDisplay} back and an email. Refunds usually take 5 to 10 days to show up.`
      : `${refundDisplay} goes back to your card. Refunds usually take 5 to 10 days to show up.`
    : "No refund, under the teacher's cancellation policy. You won't be charged again.";

  return (
    <AppDialog
      open={isOpen}
      onOpenChange={(o) => {
        if (!o && !submitting) onClose();
      }}
      title={`Cancel ${lessonTitle}?`}
      width={460}
      footer={
        <>
          <button type="button" className={BTN_GHOST} disabled={submitting} onClick={onClose}>
            Keep lesson
          </button>
          <button
            type="button"
            className={cn(BTN_PRIMARY, !refundsFully && "bg-live hover:bg-live/90")}
            disabled={submitting}
            onClick={handleConfirm}
          >
            {submitting ? "Canceling…" : "Cancel lesson"}
          </button>
        </>
      }
    >
      <p className="text-[15px] text-ink-2">{description}</p>
    </AppDialog>
  );
}
