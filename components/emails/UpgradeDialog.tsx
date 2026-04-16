'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { loadStripe, type StripeElementsOptions } from '@stripe/stripe-js';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

// ── Payment form (inside Elements provider) ────────────────────────

function PaymentForm({
  communitySlug,
  onSuccess,
}: {
  communitySlug: string;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Poll quota to detect when subscription becomes active
  useEffect(() => {
    if (!processing) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/community/${communitySlug}/broadcasts/quota`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.tier === 'paid' || data.tier === 'vip') {
          setProcessing(false);
          toast.success('Subscription active!');
          onSuccess();
        }
      } catch {}
    }, 2000);
    return () => clearInterval(id);
  }, [processing, communitySlug, onSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/${communitySlug}/admin/emails?subscription=success`,
        },
        redirect: 'if_required',
      });

      if (error) {
        toast.error(error.message || 'Payment failed');
      } else {
        setProcessing(true);
      }
    } catch {
      toast.error('Payment failed');
    } finally {
      setLoading(false);
    }
  };

  if (processing) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Activating your subscription...
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <Button type="submit" disabled={!stripe || loading} className="w-full">
        {loading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Processing...</span>
          </div>
        ) : (
          'Subscribe — €10/month'
        )}
      </Button>
    </form>
  );
}

// ── Main dialog ────────────────────────────────────────────────────

export interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communitySlug: string;
}

export function UpgradeDialog({
  open,
  onOpenChange,
  communitySlug,
}: UpgradeDialogProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setClientSecret(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoadingIntent(true);
    setError(null);

    fetch(`/api/community/${communitySlug}/broadcasts/subscription`, {
      method: 'POST',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error || 'Failed');
        return res.json();
      })
      .then(({ clientSecret }) => {
        if (!cancelled) setClientSecret(clientSecret);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingIntent(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, communitySlug]);

  const handleSuccess = () => {
    onOpenChange(false);
    window.location.reload();
  };

  const options: StripeElementsOptions | undefined = clientSecret
    ? { clientSecret, appearance: { theme: 'stripe' as const } }
    : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Upgrade to unlimited broadcasts</DialogTitle>
          <DialogDescription>
            You&apos;ve used all your free broadcasts this month. Subscribe
            to send unlimited broadcasts for €10/month. Cancel anytime.
          </DialogDescription>
        </DialogHeader>

        {loadingIntent && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="text-sm text-rose-600 py-4 text-center">
            {error}
          </div>
        )}

        {clientSecret && options && (
          <Elements stripe={stripePromise} options={options}>
            <PaymentForm
              communitySlug={communitySlug}
              onSuccess={handleSuccess}
            />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}
