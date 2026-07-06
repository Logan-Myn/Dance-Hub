'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import PaymentModal from '@/components/PaymentModal';
import { PreRegistrationPaymentModal } from '@/components/PreRegistrationPaymentModal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthModal } from '@/contexts/AuthModalContext';

export interface JoinCommunityData {
  id: string;
  slug: string;
  name: string;
  membershipEnabled?: boolean;
  membershipPrice?: number;
  yearlyEnabled?: boolean;
  yearlyPrice?: number;
  yearlyBenefits?: string;
  stripeAccountId?: string | null;
  isMember?: boolean;
  status?: 'active' | 'pre_registration' | 'inactive';
}

export interface UseJoinCommunityResult {
  join: () => Promise<void>;
  isJoining: boolean;
  modals: ReactNode;
}

/**
 * Drives the join-community flow (free / paid / pre-registration), owning the
 * payment modal state. Render `result.modals` somewhere in your tree to mount
 * the Stripe modals; call `result.join()` from your CTA button.
 *
 * When the community offers a yearly plan alongside monthly, `join()` first
 * opens a plan chooser; the chosen plan is sent to join-paid so the correct
 * price is subscribed.
 */
export function useJoinCommunity(
  community: JoinCommunityData | undefined,
): UseJoinCommunityResult {
  const { user } = useAuth();
  const { showAuthModal } = useAuthModal();
  const router = useRouter();

  const [isJoining, setIsJoining] = useState(false);
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [showPlanChooser, setShowPlanChooser] = useState(false);
  const [preRegClientSecret, setPreRegClientSecret] = useState<string | null>(null);
  const [preRegStripeAccountId, setPreRegStripeAccountId] = useState<string | null>(null);
  const [preRegOpeningDate, setPreRegOpeningDate] = useState<string | null>(null);

  const closePayment = () => setPaymentClientSecret(null);
  const closePreReg = () => {
    setPreRegClientSecret(null);
    setPreRegStripeAccountId(null);
    setPreRegOpeningDate(null);
  };

  const onJoinSuccess = () => {
    closePayment();
    toast.success('Successfully joined the community!');
    if (community) router.push(`/${community.slug}`);
    router.refresh();
  };

  const onPreRegSuccess = () => {
    closePreReg();
    toast.success('Pre-registration confirmed!');
    window.location.reload();
  };

  // Create the paid membership subscription for the chosen plan and open the
  // payment modal. join-paid selects the monthly vs yearly Stripe price.
  const startPaid = async (plan: 'monthly' | 'yearly') => {
    if (!user || !community) return;
    setShowPlanChooser(false);
    setSelectedPlan(plan);
    setIsJoining(true);
    try {
      const response = await fetch(`/api/community/${community.slug}/join-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, email: user.email, plan }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create payment');
      }
      const { clientSecret } = await response.json();
      setPaymentClientSecret(clientSecret);
    } catch (error) {
      console.error('Error joining community:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to join community');
    } finally {
      setIsJoining(false);
    }
  };

  const join = async () => {
    if (!user) {
      showAuthModal('signup');
      return;
    }
    if (!community) {
      toast.error('Community data not available');
      return;
    }

    if (community.status === 'pre_registration') {
      if (!community.membershipEnabled || !community.membershipPrice) {
        toast.error('This community requires paid membership for pre-registration');
        return;
      }
      setIsJoining(true);
      try {
        const response = await fetch(
          `/api/community/${community.slug}/join-pre-registration`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, email: user.email }),
          },
        );
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.error || 'Failed to start pre-registration');
        }
        const { clientSecret, stripeAccountId, openingDate } = await response.json();
        setPreRegClientSecret(clientSecret);
        setPreRegStripeAccountId(stripeAccountId);
        setPreRegOpeningDate(openingDate);
      } catch (error) {
        console.error('Error joining community:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to join community');
      } finally {
        setIsJoining(false);
      }
      return;
    }

    const isPaid =
      community.membershipEnabled &&
      community.membershipPrice &&
      community.membershipPrice > 0;

    if (isPaid) {
      // Offer the plan chooser when a yearly option is configured; otherwise go
      // straight to the monthly checkout.
      if (community.yearlyEnabled && (community.yearlyPrice ?? 0) > 0) {
        setShowPlanChooser(true);
        return;
      }
      await startPaid('monthly');
      return;
    }

    // Free membership.
    setIsJoining(true);
    try {
      const response = await fetch(`/api/community/${community.slug}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to join community');
      }
      onJoinSuccess();
    } catch (error) {
      console.error('Error joining community:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to join community');
    } finally {
      setIsJoining(false);
    }
  };

  const modals = (
    <>
      {showPlanChooser && community && (
        <Dialog open onOpenChange={(open) => { if (!open) setShowPlanChooser(false); }}>
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle>Choose your plan</DialogTitle>
              <DialogDescription>Pick how you want to pay.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => startPaid('monthly')}
                className="rounded-xl border border-border/60 p-4 text-left hover:border-primary transition-colors"
              >
                <div className="font-semibold">€{community.membershipPrice}/month</div>
                <div className="text-sm text-muted-foreground">Billed monthly. Cancel anytime.</div>
              </button>
              <button
                type="button"
                onClick={() => startPaid('yearly')}
                className="rounded-xl border border-primary/60 bg-primary/5 p-4 text-left hover:border-primary transition-colors"
              >
                <div className="font-semibold">€{community.yearlyPrice}/year</div>
                {community.yearlyBenefits && (
                  <div className="text-sm text-muted-foreground whitespace-pre-line mt-1">
                    {community.yearlyBenefits}
                  </div>
                )}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {paymentClientSecret && community && (
        <PaymentModal
          isOpen
          onClose={closePayment}
          clientSecret={paymentClientSecret}
          stripeAccountId={community.stripeAccountId || null}
          price={
            selectedPlan === 'yearly'
              ? community.yearlyPrice || 0
              : community.membershipPrice || 0
          }
          plan={selectedPlan}
          communitySlug={community.slug}
          onSuccess={onJoinSuccess}
        />
      )}
      {preRegClientSecret && preRegStripeAccountId && preRegOpeningDate && community && (
        <PreRegistrationPaymentModal
          isOpen
          onClose={closePreReg}
          clientSecret={preRegClientSecret}
          stripeAccountId={preRegStripeAccountId}
          communitySlug={community.slug}
          communityName={community.name}
          price={community.membershipPrice || 0}
          openingDate={preRegOpeningDate}
          onSuccess={onPreRegSuccess}
        />
      )}
    </>
  );

  return { join, isJoining, modals };
}
