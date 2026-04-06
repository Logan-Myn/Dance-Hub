# Pre-Registration Frontend Integration Guide

This guide provides the code changes needed to complete the pre-registration frontend implementation.

## 1. Add State Variables to CommunitySettingsModal.tsx

Add these state variables after line 232 (after the existing useState declarations):

```typescript
// Pre-registration state
const [communityStatus, setCommunityStatus] = useState<'active' | 'pre_registration' | 'inactive'>('active');
const [openingDate, setOpeningDate] = useState<string>('');
const [canChangeOpeningDate, setCanChangeOpeningDate] = useState(true);
```

## 2. Update useEffect to Load Community Status

In the `useEffect` that loads community data (around line 235-300), add these fields to the SELECT query:

```typescript
const { data: community } = await supabase
  .from("communities")
  .select(`
    *,
    status,
    opening_date,
    can_change_opening_date
  `)
  .eq("id", communityId)
  .single();

if (community) {
  // Existing setState calls...
  setCommunityStatus(community.status || 'active');
  setOpeningDate(community.opening_date || '');
  setCanChangeOpeningDate(community.can_change_opening_date ?? true);
}
```

## 3. Add Pre-Registration Section to General Settings

Insert this code after the Description field (around line 1750):

```typescript
{/* Community Status */}
<div>
  <label className="block text-sm font-medium text-gray-700 mb-2">
    Community Status
  </label>
  <Select
    value={communityStatus}
    onValueChange={(value: 'active' | 'pre_registration' | 'inactive') => setCommunityStatus(value)}
  >
    <SelectTrigger className="w-full">
      <SelectValue placeholder="Select status" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="active">Active - Members can join and access content</SelectItem>
      <SelectItem value="pre_registration">Pre-Registration - Accept pre-registrations only</SelectItem>
      <SelectItem value="inactive">Inactive - Community is closed</SelectItem>
    </SelectContent>
  </Select>

  {communityStatus === 'pre_registration' && (
    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
      <p className="text-sm text-blue-800">
        <strong>Pre-Registration Mode:</strong> Students can save their payment method now and will be automatically charged on the opening date.
      </p>
    </div>
  )}
</div>

{/* Opening Date (conditional on pre-registration status) */}
{communityStatus === 'pre_registration' && (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">
      Opening Date & Time
    </label>
    <Input
      type="datetime-local"
      value={openingDate ? new Date(openingDate).toISOString().slice(0, 16) : ''}
      onChange={(e) => setOpeningDate(e.target.value ? new Date(e.target.value).toISOString() : '')}
      min={new Date().toISOString().slice(0, 16)}
      className="mt-1"
      disabled={!canChangeOpeningDate}
    />
    <p className="text-xs text-gray-500 mt-1">
      Pre-registered members will be automatically charged on this date.
    </p>

    {!canChangeOpeningDate && (
      <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
        <p className="text-sm text-yellow-800">
          Opening date changes are currently restricted. Contact support if you need to modify the date.
        </p>
      </div>
    )}
  </div>
)}
```

## 4. Update the Save Function

Modify the `updateGeneralSettings` function (around line 870-930) to include the new fields:

```typescript
const updateGeneralSettings = async () => {
  try {
    setIsUpdating(true);

    // Validation for pre-registration
    if (communityStatus === 'pre_registration') {
      if (!openingDate) {
        toast.error('Opening date is required for pre-registration mode');
        return;
      }

      const openingDateTime = new Date(openingDate);
      const now = new Date();

      if (openingDateTime <= now) {
        toast.error('Opening date must be in the future');
        return;
      }

      // Check if more than 1 month in future (optional restriction)
      const oneMonthFromNow = new Date();
      oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

      if (openingDateTime > oneMonthFromNow) {
        const confirm = window.confirm(
          'Opening date is more than 1 month away. Are you sure you want to set this date?'
        );
        if (!confirm) return;
      }
    }

    const { error } = await supabase
      .from("communities")
      .update({
        name,
        description,
        custom_links: links,
        status: communityStatus,
        opening_date: communityStatus === 'pre_registration' ? openingDate : null,
      })
      .eq("id", communityId);

    if (error) throw error;

    toast.success("Settings updated successfully");
    onUpdate();
  } catch (error) {
    console.error("Error updating settings:", error);
    toast.error("Failed to update settings");
  } finally {
    setIsUpdating(false);
  }
};
```

## 5. Create PreRegistrationPaymentModal Component

Create new file: `/components/PreRegistrationPaymentModal.tsx`

```typescript
"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Loader2, Calendar, CreditCard } from "lucide-react";

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
  const [setupIntentId, setSetupIntentId] = useState<string | null>(null);

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
      // Confirm the SetupIntent (saves payment method without charging)
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
      });

      if (error) {
        throw error;
      }

      if (setupIntent && setupIntent.status === 'succeeded') {
        setSetupIntentId(setupIntent.id);

        // Confirm pre-registration with backend
        const response = await fetch(`/api/community/${communitySlug}/confirm-pre-registration`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: (await import('@/lib/supabase')).createClient().auth.getUser().then(r => r.data.user?.id),
            setupIntentId: setupIntent.id,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to confirm pre-registration');
        }

        onSuccess();
      }
    } catch (err: any) {
      console.error('Pre-registration error:', err);
      alert(err.message || 'Failed to save payment method');
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
              Amount: €{(price / 100).toFixed(2)}/month
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
      <DialogContent className="sm:max-w-[500px]">
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
```

## 6. Update HeroSection.tsx for Pre-Registration

In `/components/sections/HeroSection.tsx`, update the `handleJoinCommunity` function (around line 161-225):

```typescript
const handleJoinCommunity = async () => {
  if (!user) {
    setIsAuthModalOpen(true);
    return;
  }

  // Check if community is in pre-registration mode
  if (communityData?.status === 'pre_registration') {
    if (!communityData.membershipEnabled || !communityData.membershipPrice) {
      toast.error('This community requires paid membership for pre-registration');
      return;
    }

    try {
      setIsJoining(true);

      // Call pre-registration API
      const response = await fetch(`/api/community/${communitySlug}/join-pre-registration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start pre-registration');
      }

      const { clientSecret, stripeAccountId, openingDate } = await response.json();

      // Open pre-registration payment modal
      setPreRegClientSecret(clientSecret);
      setPreRegStripeAccountId(stripeAccountId);
      setPreRegOpeningDate(openingDate);
      setIsPreRegModalOpen(true);

    } catch (error: any) {
      console.error('Pre-registration error:', error);
      toast.error(error.message || 'Failed to start pre-registration');
    } finally {
      setIsJoining(false);
    }
    return;
  }

  // Existing join flow for active communities...
  // (keep existing code)
};
```

Add these state variables at the top of HeroSection component:

```typescript
const [isPreRegModalOpen, setIsPreRegModalOpen] = useState(false);
const [preRegClientSecret, setPreRegClientSecret] = useState('');
const [preRegStripeAccountId, setPreRegStripeAccountId] = useState('');
const [preRegOpeningDate, setPreRegOpeningDate] = useState('');
```

Add the modal rendering before the closing div:

```typescript
{isPreRegModalOpen && preRegClientSecret && (
  <PreRegistrationPaymentModal
    isOpen={isPreRegModalOpen}
    onClose={() => setIsPreRegModalOpen(false)}
    clientSecret={preRegClientSecret}
    stripeAccountId={preRegStripeAccountId}
    communitySlug={communitySlug}
    communityName={communityData?.name || ''}
    price={communityData?.membershipPrice || 0}
    openingDate={preRegOpeningDate}
    onSuccess={() => {
      setIsPreRegModalOpen(false);
      toast.success('Pre-registration confirmed! You'll be charged on the opening date.');
      router.push(`/${communitySlug}`);
    }}
  />
)}
```

Update the button text logic (around line 287):

```typescript
<Button
  disabled={
    (section.content.buttonType === 'join' && communityData?.isMember) ||
    (communityData?.status === 'inactive')
  }
>
  {communityData?.isMember && !isEditing
    ? "You're already a member"
    : communityData?.status === 'pre_registration'
      ? `Pre-Register for €${communityData?.membershipPrice}/month`
      : communityData?.status === 'inactive'
        ? 'Community Closed'
        : communityData?.membershipEnabled && communityData?.membershipPrice && communityData?.membershipPrice > 0
          ? `Join for €${communityData.membershipPrice}/month`
          : 'Join for free'
  }
</Button>
```

## 7. Add Pre-Registration Badge to Community Cards

In `/app/discovery/page.tsx`, update the community card rendering (around line 300):

```typescript
<div className="relative">
  <img
    src={community.image_url || "/placeholder-community.jpg"}
    alt={community.name}
    className="w-full h-48 object-cover"
  />

  {/* Add status badge */}
  {community.status === 'pre_registration' && (
    <div className="absolute top-2 right-2 bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center space-x-1">
      <Calendar className="h-3 w-3" />
      <span>Pre-Registration</span>
    </div>
  )}

  {community.status === 'inactive' && (
    <div className="absolute top-2 right-2 bg-gray-600 text-white px-3 py-1 rounded-full text-xs font-semibold">
      Closed
    </div>
  )}
</div>
```

Add opening date display in the card content:

```typescript
<div className="p-4">
  <h3 className="text-xl font-semibold mb-2">{community.name}</h3>
  <p className="text-gray-600 text-sm mb-4 line-clamp-2">
    {community.description || "No description available"}
  </p>

  {community.status === 'pre_registration' && community.opening_date && (
    <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
      <p className="text-blue-800">
        <strong>Opens:</strong> {new Date(community.opening_date).toLocaleDateString()}
      </p>
    </div>
  )}

  {/* Existing metadata and button... */}
</div>
```

## 8. Update Access Control for Pre-Registered Members

In `/app/[communitySlug]/page.tsx`, update the membership check (around line 443-454):

```typescript
const { data: memberData } = await supabase
  .from("community_members")
  .select("*, community:communities(status, opening_date)")
  .eq("community_id", communityData.id)
  .eq("user_id", currentUser.id)
  .maybeSingle();

if (!memberData) {
  router.replace(`/${communitySlug}/about`);
  return;
}

// Check if member is pre-registered
if (memberData.status === 'pre_registered' || memberData.status === 'pending_pre_registration') {
  // Show coming soon page instead of redirecting
  setIsPreRegistered(true);
  setIsMember(false);
} else {
  setIsMember(true);
}
```

## 9. Create Coming Soon Component

Create new file: `/components/PreRegistrationComingSoon.tsx`

```typescript
"use client";

import React from "react";
import { Calendar, Clock, CreditCard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface PreRegistrationComingSoonProps {
  communityName: string;
  communitySlug: string;
  openingDate: string;
  membershipPrice: number;
  onCancel: () => void;
}

export function PreRegistrationComingSoon({
  communityName,
  communitySlug,
  openingDate,
  membershipPrice,
  onCancel,
}: PreRegistrationComingSoonProps) {
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

  const getTimeUntilOpening = () => {
    const now = new Date();
    const opening = new Date(openingDate);
    const diff = opening.getTime() - now.getTime();

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) {
      return `${days} day${days !== 1 ? 's' : ''} and ${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full p-8 space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <Calendar className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Coming Soon!
          </h1>
          <p className="text-lg text-gray-600">
            You're pre-registered for <strong>{communityName}</strong>
          </p>
        </div>

        {/* Opening Date */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg p-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide mb-2">Opens On</p>
          <p className="text-2xl font-bold mb-4">{formatDate(openingDate)}</p>
          <div className="flex items-center justify-center space-x-2 text-blue-100">
            <Clock className="h-4 w-4" />
            <p className="text-sm">In {getTimeUntilOpening()}</p>
          </div>
        </div>

        {/* What Happens Next */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">What happens next?</h2>

          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <span className="text-green-600 font-semibold text-sm">1</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Payment Method Saved</p>
                <p className="text-sm text-gray-600">
                  Your payment method has been securely saved. No charges yet!
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-semibold text-sm">2</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Automatic Charge on Opening</p>
                <p className="text-sm text-gray-600">
                  On {new Date(openingDate).toLocaleDateString()}, you'll be automatically charged €{(membershipPrice / 100).toFixed(2)}/month
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                <span className="text-purple-600 font-semibold text-sm">3</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Instant Access</p>
                <p className="text-sm text-gray-600">
                  You'll receive full access to all community features immediately after payment
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Info */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-start space-x-3">
          <CreditCard className="h-5 w-5 text-gray-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-900">Payment Details</p>
            <p className="text-sm text-gray-600">
              Monthly subscription: €{(membershipPrice / 100).toFixed(2)}
            </p>
          </div>
        </div>

        {/* Cancel Option */}
        <div className="pt-4 border-t border-gray-200">
          <Button
            variant="outline"
            onClick={onCancel}
            className="w-full"
          >
            <X className="h-4 w-4 mr-2" />
            Cancel Pre-Registration
          </Button>
          <p className="text-xs text-gray-500 text-center mt-2">
            You can cancel anytime before {new Date(openingDate).toLocaleDateString()} without being charged
          </p>
        </div>
      </Card>
    </div>
  );
}
```

## 10. Integrate Coming Soon Component

In `/app/[communitySlug]/page.tsx`, render the coming soon component when user is pre-registered:

```typescript
// Add state
const [isPreRegistered, setIsPreRegistered] = useState(false);

// In the render (before the main community content):
if (isPreRegistered && communityData) {
  return (
    <PreRegistrationComingSoon
      communityName={communityData.name}
      communitySlug={communitySlug}
      openingDate={communityData.opening_date}
      membershipPrice={communityData.membership_price}
      onCancel={async () => {
        if (confirm('Are you sure you want to cancel your pre-registration? You will not be charged.')) {
          try {
            const response = await fetch(`/api/community/${communitySlug}/cancel-pre-registration`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: user?.id }),
            });

            if (response.ok) {
              toast.success('Pre-registration cancelled');
              router.push(`/${communitySlug}/about`);
            } else {
              throw new Error('Failed to cancel');
            }
          } catch (error) {
            toast.error('Failed to cancel pre-registration');
          }
        }
      }}
    />
  );
}
```

## Summary

These changes implement:
1. ✅ Community status and opening date in settings
2. ✅ Pre-registration payment modal with SetupIntent
3. ✅ Updated join flow to detect pre-registration
4. ✅ Pre-registration badges on community cards
5. ✅ Coming soon page for pre-registered members
6. ✅ Cancellation functionality

**Next Steps:**
1. Apply these code changes to the respective files
2. Test the pre-registration flow
3. Add the pre-registered members list view in settings (optional)
4. Test cancellation flow
5. Deploy and monitor
