"use client";

import * as React from "react";
import toast from "react-hot-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
          : `Lesson canceled.`
      );
      onCancelled();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Could not cancel lesson");
    } finally {
      setSubmitting(false);
    }
  };

  const description = refundsFully
    ? role === "teacher"
      ? `This will refund ${refundDisplay} to the student. Refunds typically take 5–10 days to appear.`
      : `${refundDisplay} will be refunded to your card. Refunds typically take 5–10 days to appear.`
    : `No refund will be issued per the teacher's cancellation policy. You will not be charged again.`;

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel {lessonTitle}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Keep lesson</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={submitting}
            className={
              refundsFully ? undefined : "bg-destructive text-destructive-foreground"
            }
          >
            {submitting ? "Canceling..." : "Cancel lesson"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
