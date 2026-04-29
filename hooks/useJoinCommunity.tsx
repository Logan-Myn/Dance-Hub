'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import PaymentModal from '@/components/PaymentModal';
import { PreRegistrationPaymentModal } from '@/components/PreRegistrationPaymentModal';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthModal } from '@/contexts/AuthModalContext';

export interface JoinCommunityData {
  id: string;
  slug: string;
  name: string;
  membershipEnabled?: boolean;
  membershipPrice?: number;
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
 */
export function useJoinCommunity(
  community: JoinCommunityData | undefined,
): UseJoinCommunityResult {
  const { user } = useAuth();
  const { showAuthModal } = useAuthModal();
  const router = useRouter();

  const [isJoining, setIsJoining] = useState(false);
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null);
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
    if (community) router.push(`/${community.slug}`);
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

    setIsJoining(true);
    try {
      if (community.status === 'pre_registration') {
        if (!community.membershipEnabled || !community.membershipPrice) {
          toast.error('This community requires paid membership for pre-registration');
          return;
        }
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
        return;
      }

      const isPaid =
        community.membershipEnabled &&
        community.membershipPrice &&
        community.membershipPrice > 0;

      if (isPaid) {
        const response = await fetch(`/api/community/${community.slug}/join-paid`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, email: user.email }),
        });
        if (!response.ok) throw new Error('Failed to create payment');
        const { clientSecret } = await response.json();
        setPaymentClientSecret(clientSecret);
        return;
      }

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
      {paymentClientSecret && community && (
        <PaymentModal
          isOpen
          onClose={closePayment}
          clientSecret={paymentClientSecret}
          stripeAccountId={community.stripeAccountId || null}
          price={community.membershipPrice || 0}
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
