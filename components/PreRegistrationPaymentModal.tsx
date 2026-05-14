"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Loader2, Calendar, CreditCard } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "react-hot-toast";

interface PreRegistrationPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientSecret: string;
  stripeAccountId: string;
  communitySlug: string;
  communityName: string;
  price: number;
  openingDate: string;
  onSuccess: () => void;
}

function PaymentForm({
  communitySlug,
  onSuccess,
  onClose,
  openingDate,
  price
}: {
  communitySlug: string;
  onSuccess: () => void;
  onClose: () => void;
  openingDate: string;
  price: number;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const { user } = useAuth();

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    setIsProcessing(true);

    try {
      if (!user) throw new Error('Not authenticated');

      // Confirm the SetupIntent (saves payment method without charging)
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
      });

      if (error) {
        throw error;
      }

      if (setupIntent && setupIntent.status === 'succeeded') {
        // Confirm pre-registration with backend
        const response = await fetch(`/api/community/${communitySlug}/confirm-pre-registration`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            setupIntentId: setupIntent.id,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to confirm pre-registration');
        }

        onSuccess();
      }
    } catch (err: any) {
      console.error('Pre-registration error:', err);
      toast.error(err.message || 'Failed to save payment method');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Opening Date Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Calendar className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-900">
              You'll be charged on:
            </p>
            <p className="text-base font-bold text-blue-700 mt-1">
              {formatDate(openingDate)}
            </p>
            <p className="text-sm text-blue-600 mt-2">
              Amount: €{(Number(price) || 0).toFixed(2)}/month
            </p>
          </div>
        </div>
      </div>

      {/* Payment Method Collection */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-center space-x-2 mb-3">
          <CreditCard className="h-5 w-5 text-gray-600" />
          <p className="text-sm font-medium text-gray-700">
            Save Payment Method
          </p>
        </div>
        <PaymentElement />
      </div>

      {/* Important Notice */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          <strong>Important:</strong> Your payment method will be saved securely.
          You won't be charged now - the charge will happen automatically on the opening date.
          You can cancel anytime before that without being charged.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-3">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isProcessing}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!stripe || isProcessing}
          className="flex-1"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Confirm Pre-Registration'
          )}
        </Button>
      </div>
    </form>
  );
}

export function PreRegistrationPaymentModal({
  isOpen,
  onClose,
  clientSecret,
  stripeAccountId,
  communitySlug,
  communityName,
  price,
  openingDate,
  onSuccess,
}: PreRegistrationPaymentModalProps) {
  const [stripePromise, setStripePromise] = useState<any>(null);

  useEffect(() => {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!;
    setStripePromise(loadStripe(publishableKey, {
      stripeAccount: stripeAccountId,
    }));
  }, [stripeAccountId]);

  const options = {
    clientSecret,
    appearance: {
      theme: 'stripe' as const,
    },
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pre-Register for {communityName}</DialogTitle>
          <DialogDescription>
            Save your payment method to secure your spot. You won't be charged until the community opens.
          </DialogDescription>
        </DialogHeader>

        {stripePromise && clientSecret && (
          <Elements stripe={stripePromise} options={options}>
            <PaymentForm
              communitySlug={communitySlug}
              onSuccess={onSuccess}
              onClose={onClose}
              openingDate={openingDate}
              price={price}
            />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}
