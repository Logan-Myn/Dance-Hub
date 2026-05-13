"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe, StripeElementsOptions } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { formatPrice } from "@/lib/utils";

interface PrivateLessonPaymentFormProps {
  clientSecret: string;
  price: number;
  onSuccess: () => void;
  onClose: () => void;
  lessonTitle: string;
}

function PrivateLessonPaymentForm({ 
  clientSecret, 
  price, 
  onSuccess, 
  onClose,
  lessonTitle 
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
          return_url: `${window.location.origin}?payment=success`,
        },
        redirect: 'if_required',
      });

      if (error) {
        toast.error(error.message || 'Payment failed');
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        toast.success("Payment successful!");
        onSuccess();
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
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
        <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
          Private Lesson: {lessonTitle}
        </h3>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {formatPrice(price)}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          One-time payment
        </p>
      </div>
      
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
  onSuccess: () => void;
}

export default function PrivateLessonPaymentModal({ 
  isOpen, 
  onClose, 
  clientSecret, 
  stripeAccountId,
  price,
  lessonTitle,
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
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
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
            onSuccess={onSuccess}
            onClose={onClose}
          />
        </Elements>
      </DialogContent>
    </Dialog>
  );
} 