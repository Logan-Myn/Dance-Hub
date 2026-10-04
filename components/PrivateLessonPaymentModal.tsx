"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe, StripeElementsOptions } from "@stripe/stripe-js";
import { PAYMENT_ELEMENT_OPTIONS } from "@/lib/stripe-payment-element";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { communityPath } from "@/lib/safe-redirect";

/** 'processing': paid with a method that settles later; the booking follows. */
export type LessonPaymentOutcome = "succeeded" | "processing";

interface PrivateLessonPaymentFormProps {
  clientSecret: string;
  price: number;
  onSuccess: (outcome: LessonPaymentOutcome) => void;
  onClose: () => void;
  lessonTitle: string;
  communitySlug: string;
  /** The booking dialog shows its own summary above the form. */
  hideSummary?: boolean;
}

export function PrivateLessonPaymentForm({ 
  clientSecret, 
  price, 
  onSuccess, 
  onClose,
  lessonTitle,
  communitySlug,
  hideSummary = false,
}: PrivateLessonPaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    setIsLoading(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          // Only used when the payment needs a redirect; that page explains
          // the outcome (lib/lesson-payment-return.ts).
          return_url: `${window.location.origin}${communityPath(communitySlug, '/private-lessons')}?lesson_payment=return`,
        },
        redirect: 'if_required',
      });

      if (error) {
        toast.error(error.message || 'Payment failed');
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        // Not "booked" yet: the booking is recorded from the payment, and a
        // payment that lost a race for the slot is refunded.
        toast.success("Payment received. Your confirmation will be emailed.");
        onSuccess('succeeded');
      } else if (paymentIntent && paymentIntent.status === 'processing') {
        // Not a failure: paying again would charge twice once it settles.
        toast.success("Your payment is processing. We'll email you as soon as your booking is confirmed.");
        onSuccess('processing');
      } else {
        toast.error('Payment was not completed');
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Payment failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {!hideSummary && (
        <div className="rounded-xl bg-surface-2 p-4">
          <h3 className="mb-1 font-medium text-ink">Private lesson: {lessonTitle}</h3>
          <p className="font-display text-[24px] font-semibold text-ink">{formatPrice(price)}</p>
          <p className="text-[13px] text-ink-2">One-time payment</p>
        </div>
      )}

      <PaymentElement options={PAYMENT_ELEMENT_OPTIONS} />

      <Button
        type="submit"
        disabled={!stripe || isLoading}
        className="h-11 w-full rounded-[10px] bg-brand text-[15px] font-semibold text-white hover:bg-brand-hover"
      >
        {isLoading ? (
          <div className="flex items-center space-x-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Processing payment...</span>
          </div>
        ) : (
          `Pay ${formatPrice(price)}`
        )}
      </Button>
    </form>
  );
}

interface PrivateLessonPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientSecret: string | null;
  stripeAccountId: string | null;
  price: number;
  lessonTitle: string;
  communitySlug: string;
  onSuccess: (outcome: LessonPaymentOutcome) => void;
}

/** The payment form without its own dialog, for the booking dialog's last step. */
export function LessonPaymentInline({
  clientSecret,
  stripeAccountId,
  price,
  lessonTitle,
  communitySlug,
  onSuccess,
}: {
  clientSecret: string;
  stripeAccountId: string;
  price: number;
  lessonTitle: string;
  communitySlug: string;
  onSuccess: (outcome: LessonPaymentOutcome) => void;
}) {
  const stripePromise = useMemo(
    () => loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!, { stripeAccount: stripeAccountId }),
    [stripeAccountId]
  );
  const options: StripeElementsOptions = {
    clientSecret,
    appearance: {
      theme: "stripe" as const,
      variables: { colorPrimary: "#8E57DB", borderRadius: "10px", fontFamily: "Figtree, system-ui, sans-serif" },
    },
  };
  return (
    <Elements stripe={stripePromise} options={options}>
      <PrivateLessonPaymentForm
        clientSecret={clientSecret}
        price={price}
        lessonTitle={lessonTitle}
        communitySlug={communitySlug}
        onSuccess={onSuccess}
        onClose={() => {}}
        hideSummary
      />
    </Elements>
  );
}

export default function PrivateLessonPaymentModal({ 
  isOpen, 
  onClose, 
  clientSecret, 
  stripeAccountId,
  price,
  lessonTitle,
  communitySlug,
  onSuccess 
}: PrivateLessonPaymentModalProps) {
  const stripePromise = useMemo(
    () =>
      stripeAccountId
        ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!, {
            stripeAccount: stripeAccountId,
          })
        : null,
    [stripeAccountId]
  );

  if (!clientSecret || !stripeAccountId || !stripePromise) return null;

  const options: StripeElementsOptions = {
    clientSecret,
    appearance: {
      theme: 'stripe' as const,
    },
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Complete Payment</DialogTitle>
          <DialogDescription>
            Complete your payment to book this private lesson
          </DialogDescription>
        </DialogHeader>
        <Elements stripe={stripePromise} options={options}>
          <PrivateLessonPaymentForm 
            clientSecret={clientSecret}
            price={price}
            lessonTitle={lessonTitle}
            communitySlug={communitySlug}
            onSuccess={onSuccess}
            onClose={onClose}
          />
        </Elements>
      </DialogContent>
    </Dialog>
  );
} 