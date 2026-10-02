"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe, StripeElementsOptions } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useEffectEvent, useMemo } from "react";
import { toast } from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { payButtonDisplay } from "@/lib/pay-button-label";

// Where the checkout is: 'submitting' while the card is being confirmed,
// 'processing' once it is paid and we wait for the membership to activate,
// 'timed_out' when that wait gave up.
type PaymentStatus = 'idle' | 'submitting' | 'processing' | 'timed_out';

// How long to wait for the membership to activate after a confirmed payment.
const ACTIVATION_WAIT_MS = 60_000;

interface PaymentFormProps {
  communitySlug: string;
  price: number;
  mode: 'payment' | 'setup';
  plan?: 'monthly' | 'yearly';
  dueTodayCents?: number | null;
  onSuccess: () => void;
  onStatusChange?: (status: PaymentStatus) => void;
}

function PaymentForm({ communitySlug, price, mode, plan, dueTodayCents, onSuccess, onStatusChange }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  // The payment form iframe takes a moment to initialise after the modal
  // opens. Track when it is fully rendered so we can keep the branded spinner
  // up until then (instead of flashing a blank / secondary loading state).
  const [isFormReady, setIsFormReady] = useState(false);
  const { user } = useAuth();
  const userId = user?.id;
  // Parents pass inline callbacks; effect events keep the polling from
  // restarting (and its time limit from resetting) on every parent render.
  const notifyActivated = useEffectEvent(() => onSuccess());
  const notifyTimedOut = useEffectEvent(() => onStatusChange?.('timed_out'));

  // Check payment status periodically, for up to ACTIVATION_WAIT_MS.
  useEffect(() => {
    if (!isProcessing || !userId) return;

    const intervalId = setInterval(async () => {
      try {
        const response = await fetch(`/api/community/${communitySlug}/check-subscription`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = await response.json();

        if (data.hasSubscription) {
          clearInterval(intervalId);
          clearTimeout(timeoutId);
          setIsProcessing(false);
          notifyActivated();
        }
      } catch (error) {
        console.error("Error checking subscription:", error);
      }
    }, 2000); // Check every 2 seconds

    const timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      setIsProcessing(false);
      setTimedOut(true);
      notifyTimedOut();
    }, ACTIVATION_WAIT_MS);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [isProcessing, communitySlug, userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    setIsLoading(true);
    onStatusChange?.('submitting');

    try {
      const { error } =
        mode === 'setup'
          ? await stripe.confirmSetup({
              elements,
              confirmParams: {
                return_url: `${window.location.origin}/${communitySlug}?success=true`,
              },
              redirect: 'if_required',
            })
          : await stripe.confirmPayment({
              elements,
              confirmParams: {
                return_url: `${window.location.origin}/${communitySlug}?success=true`,
              },
              redirect: 'if_required',
            });

      if (error) {
        toast.error(error.message || 'Payment failed');
        setIsProcessing(false);
        onStatusChange?.('idle');
      } else {
        setIsProcessing(true);
        onStatusChange?.('processing');
        toast.success("Payment successful! Processing your membership...");
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Payment failed');
      setIsProcessing(false);
      onStatusChange?.('idle');
    } finally {
      setIsLoading(false);
    }
  };

  if (timedOut) {
    return (
      <div className="flex flex-col items-center justify-center space-y-3 py-8 text-center">
        <p className="text-sm font-medium">Your payment went through.</p>
        <p className="text-sm text-muted-foreground">
          Your membership is taking longer than usual to activate. It should be ready in a few
          minutes. Refresh the page to check, or write to hello@dance-hub.io if it doesn&apos;t appear.
        </p>
        <Button type="button" variant="outline" onClick={() => window.location.reload()}>
          Refresh page
        </Button>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-gray-500">Processing your membership...</p>
        <p className="text-xs text-gray-400">This may take a few moments. Please keep this window open.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="relative min-h-[80px]">
        {!isFormReady && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center space-y-3 bg-background">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading payment details...</p>
          </div>
        )}
        <PaymentElement onReady={() => setIsFormReady(true)} />
      </div>
      {isFormReady && (() => {
        const display = payButtonDisplay({ mode, dueTodayCents: dueTodayCents ?? null, price, plan });
        return (
          <div className="space-y-2">
            <Button
              type="submit"
              disabled={!stripe || isLoading}
              className="w-full"
            >
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing payment...</span>
                </div>
              ) : (
                display.label
              )}
            </Button>
            {display.caption && (
              <p className="text-center text-xs text-muted-foreground">{display.caption}</p>
            )}
          </div>
        );
      })()}
    </form>
  );
}

// Small collapsible promo-code entry. A "Do you have a promo code?" link
// reveals an input + Apply. Applying re-creates the membership subscription
// with the discount (see PaymentModal.applyPromo).
function PromoCodeEntry({
  applied,
  applying,
  onApply,
}: {
  applied: string | null;
  applying: boolean;
  onApply: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');

  if (applied) {
    return <p className="text-sm text-green-600">Promo applied: {applied}</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-primary underline underline-offset-2"
      >
        Do you have a promo code?
      </button>
    );
  }

  return (
    <div className="flex gap-2">
      <input
        autoFocus
        className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm uppercase"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Enter code"
        onKeyDown={(e) => { if (e.key === 'Enter' && code.trim() && !applying) onApply(code); }}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => onApply(code)}
        disabled={!code.trim() || applying}
      >
        {applying ? 'Applying...' : 'Apply'}
      </Button>
    </div>
  );
}

interface PaymentModalBodyProps {
  clientSecret: string | null;
  stripeAccountId: string | null;
  communitySlug: string;
  price: number;
  mode?: 'payment' | 'setup';
  plan?: 'monthly' | 'yearly';
  onSuccess: () => void;
  /**
   * Called with true while closing the checkout would be unsafe (a payment is
   * being confirmed, or it is paid and the membership is activating). The
   * dialog that hosts this body should ignore close requests until false.
   */
  onLockChange?: (locked: boolean) => void;
}

/**
 * Inner content of the checkout (header + loading spinner + payment form),
 * without a Dialog wrapper. Render it inside an existing DialogContent so the
 * join flow's plan chooser and the checkout can share ONE dialog (the chooser
 * swaps to this in place, so there is no second modal to flash open). The
 * PaymentModal default export wraps this in its own dialog for other callers.
 */
export function PaymentModalBody({
  clientSecret,
  stripeAccountId,
  communitySlug,
  price,
  mode: initialMode = 'payment',
  plan,
  onSuccess,
  onLockChange,
}: PaymentModalBodyProps) {
  const { user } = useAuth();

  // Local copies so applying a promo can swap in a new subscription's client
  // secret + mode without the parent re-opening the modal.
  const [activeSecret, setActiveSecret] = useState<string | null>(clientSecret);
  const [activeMode, setActiveMode] = useState<'payment' | 'setup'>(initialMode);
  const [applied, setApplied] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  // Amount actually charged on the first invoice once a promo is applied (minor
  // units). Null means show the plain recurring price on the button.
  const [dueTodayCents, setDueTodayCents] = useState<number | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');

  // Reset when the parent hands us a fresh join (new client secret).
  useEffect(() => {
    setActiveSecret(clientSecret);
    setActiveMode(initialMode);
    setApplied(null);
    setDueTodayCents(null);
    setPaymentStatus('idle');
  }, [clientSecret, initialMode]);

  // Applying a promo code replaces the subscription, and closing the dialog
  // invites a second Join: neither is safe once the card is being charged.
  const locked = paymentStatus === 'submitting' || paymentStatus === 'processing';
  const notifyLock = useEffectEvent((value: boolean) => onLockChange?.(value));
  useEffect(() => {
    notifyLock(locked);
  }, [locked]);

  const stripePromise = useMemo(
    () =>
      stripeAccountId
        ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!, {
            stripeAccount: stripeAccountId,
          })
        : null,
    [stripeAccountId],
  );

  const applyPromo = async (rawCode: string) => {
    if (!user) return;
    setApplying(true);
    try {
      const vRes = await fetch(`/api/community/${communitySlug}/promo-codes/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: rawCode, plan }),
      });
      const v = await vRes.json();
      if (!v.valid) {
        toast.error(v.reason || 'That code is not valid.');
        return;
      }

      // Re-create the membership subscription with the discount attached.
      // join-paid cleans up the previous incomplete subscription for this user.
      const jRes = await fetch(`/api/community/${communitySlug}/join-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promotionCodeId: v.promotionCodeId, plan }),
      });
      if (!jRes.ok) {
        const jData = await jRes.json().catch(() => ({}));
        // The earlier checkout turned out to be paid already.
        if (jData.alreadyMember) {
          onSuccess();
          return;
        }
        toast.error('Could not apply the code. Please try again.');
        return;
      }
      const { clientSecret: newSecret, requiresSetup, amountDue } = await jRes.json();
      setActiveSecret(newSecret);
      setActiveMode(requiresSetup ? 'setup' : 'payment');
      setDueTodayCents(typeof amountDue === 'number' ? amountDue : null);
      setApplied(v.preview.label);
      toast.success(`Promo applied: ${v.preview.label}`);
    } catch {
      toast.error('Could not apply the code. Please try again.');
    } finally {
      setApplying(false);
    }
  };

  if (!stripeAccountId || !stripePromise) return null;

  const options: StripeElementsOptions | undefined = activeSecret
    ? { clientSecret: activeSecret, appearance: { theme: 'stripe' as const } }
    : undefined;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Join Community</DialogTitle>
        <DialogDescription>
          Complete your payment to join this community
        </DialogDescription>
      </DialogHeader>

      {!activeSecret ? (
        // The subscription is still being created server-side. Keep this same
        // dialog open with a spinner (rather than a separate loading dialog
        // that would flash as it hands off), and swap in the payment form in
        // place once the client secret arrives.
        <div className="flex flex-col items-center justify-center space-y-3 py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Setting up your payment...</p>
        </div>
      ) : (
        <>
          {paymentStatus === 'idle' && (
            <div className="mb-4">
              <PromoCodeEntry applied={applied} applying={applying} onApply={applyPromo} />
            </div>
          )}

          {/* key on the client secret so Elements re-mounts with the discounted
              amount after a promo is applied. */}
          <Elements key={activeSecret} stripe={stripePromise} options={options}>
            <PaymentForm
              communitySlug={communitySlug}
              price={price}
              mode={activeMode}
              plan={plan}
              dueTodayCents={dueTodayCents}
              onSuccess={onSuccess}
              onStatusChange={setPaymentStatus}
            />
          </Elements>
        </>
      )}
    </>
  );
}

interface PaymentModalProps extends PaymentModalBodyProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PaymentModal({ isOpen, onClose, ...body }: PaymentModalProps) {
  const [locked, setLocked] = useState(false);
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !locked) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[425px]">
        <PaymentModalBody {...body} onLockChange={setLocked} />
      </DialogContent>
    </Dialog>
  );
}
