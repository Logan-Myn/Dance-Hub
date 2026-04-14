'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communitySlug: string;
}

export function UpgradeDialog({ open, onOpenChange, communitySlug }: UpgradeDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/community/${communitySlug}/broadcasts/subscription`, { method: 'POST' });
      if (!res.ok) throw new Error('Checkout failed');
      const { checkoutUrl } = await res.json();
      window.location.href = checkoutUrl;
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upgrade to unlimited broadcasts</DialogTitle>
          <DialogDescription>
            You&apos;ve sent 10 emails this month. Upgrade to send unlimited broadcasts for €10/month.
          </DialogDescription>
        </DialogHeader>
        <ul className="text-sm space-y-2 py-2">
          <li>Unlimited broadcasts to your community</li>
          <li>Cancel anytime from the same page</li>
          <li>Fair-use cap of 200 sends per month</li>
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubscribe} disabled={loading}>
            {loading ? 'Redirecting…' : 'Subscribe — €10/month'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
