"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe, StripeElementsOptions } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useMemo } from "react";
import { toast } from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface PaymentFormProps {
  clientSecret: string;
  communitySlug: string;
  price: number;
  onSuccess: () => void;
  onClose: () => void;
}

function PaymentForm({ clientSecret, communitySlug, price, onSuccess, onClose }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { user } = useAuth();

  // Check payment status periodically
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isProcessing && user) {
      intervalId = setInterval(async () => {
        try {
          const response = await fetch(`/api/community/${communitySlug}/check-subscription`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.id }),
          });
          const data = await response.json();

          if (data.hasSubscription) {
            setIsProcessing(false);
            onSuccess();
          }
        } catch (error) {
          console.error("Error checking subscription:", error);
        }
      }, 2000); // Check every 2 seconds
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isProcessing, communitySlug, onSuccess, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    setIsLoading(true);

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/${communitySlug}?success=true`,
        },
      });

      if (error) {
        toast.error(error.message || 'Payment failed');
        setIsProcessing(false);
      } else {
        setIsProcessing(true);
        toast.success("Payment successful! Processing your membership...");
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Payment failed');
      setIsProcessing(false);
    } finally {
      setIsLoading(false);
    }
  };

  if (isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-gray-500">Processing your membership...</p>
        <p className="text-xs text-gray-400">This may take a few moments</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
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
          `Pay €${price}/month`
        )}
      </Button>
    </form>
  );
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientSecret: string | null;
  stripeAccountId: string | null;
  communitySlug: string;
  price: number;
  onSuccess: () => void;
}

export default function PaymentModal({ 
  isOpen, 
  onClose, 
  clientSecret, 
  stripeAccountId,
  communitySlug,
  price,
  onSuccess 
}: PaymentModalProps) {
  const stripePromise = useMemo(
    () =>
      stripeAccountId
        ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!, {
            stripeAccount: stripeAccountId,
          })
        : null,
    [stripeAccountId],
  );

  const options: StripeElementsOptions = {
    clientSecret: clientSecret ?? '',
    appearance: { theme: 'stripe' as const },
  };

  if (!clientSecret || !stripeAccountId || !stripePromise) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Join Community</DialogTitle>
          <DialogDescription>
            Complete your payment to join this community
          </DialogDescription>
        </DialogHeader>
        <Elements stripe={stripePromise} options={options}>
          <PaymentForm 
            clientSecret={clientSecret}
            communitySlug={communitySlug}
            price={price}
            onSuccess={onSuccess}
            onClose={onClose}
          />
        </Elements>
      </DialogContent>
    </Dialog>
  );
}