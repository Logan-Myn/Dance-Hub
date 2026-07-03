'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  communitySlug: string;
  price: number;
  onContinue: (promotionCodeId: string | null) => void;
  isContinuing: boolean;
}

export function JoinPromoModal({ isOpen, onClose, communitySlug, price, onContinue, isContinuing }: Props) {
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [applied, setApplied] = useState<{ id: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/community/${communitySlug}/promo-codes/validate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.valid) setApplied({ id: data.promotionCodeId, label: data.preview.label });
      else { setApplied(null); setError(data.reason || 'That code is not valid.'); }
    } catch {
      setError('Could not check that code. Please try again.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Join Community</DialogTitle>
          <DialogDescription>Membership is €{price}/month.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Have a promo code?</label>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm uppercase"
                value={code}
                onChange={(e) => { setCode(e.target.value); setApplied(null); setError(null); }}
                placeholder="Enter code"
              />
              <Button type="button" variant="outline" onClick={apply} disabled={!code.trim() || checking}>
                {checking ? 'Checking...' : 'Apply'}
              </Button>
            </div>
            {applied && <p className="text-sm text-green-600">Applied: {applied.label}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <Button className="w-full" onClick={() => onContinue(applied?.id ?? null)} disabled={isContinuing}>
            {isContinuing ? 'Preparing...' : 'Continue to payment'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
