'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import type { PromoCodeWithUsage, CreatePromoCodeInput, AppliesToPlan } from '@/lib/promo-codes/types';
import { formatDiscountLabel, formatDurationLabel } from '@/lib/promo-codes/format';

const EMPTY: CreatePromoCodeInput = {
  code: '', discountType: 'percent', discountValue: 20,
  duration: 'once', durationInMonths: 3, maxRedemptions: null, expiresAt: null,
  appliesToPlan: 'both',
};

export function PromoCodesManager({ communitySlug, yearlyEnabled }: { communitySlug: string; yearlyEnabled: boolean }) {
  const [codes, setCodes] = useState<PromoCodeWithUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<CreatePromoCodeInput>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/community/${communitySlug}/promo-codes`);
      const data = await res.json();
      if (res.ok) setCodes(data.codes);
      else toast.error(data.error || 'Failed to load promo codes');
    } finally {
      setLoading(false);
    }
  }, [communitySlug]);

  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: CreatePromoCodeInput = {
        ...form,
        code: form.code.trim(),
        durationInMonths: form.duration === 'repeating' ? Number(form.durationInMonths) : null,
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
        expiresAt: form.expiresAt || null,
      };
      const res = await fetch(`/api/community/${communitySlug}/promo-codes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to create code'); return; }
      toast.success('Promo code created');
      setForm(EMPTY);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function toggle(code: PromoCodeWithUsage) {
    const res = await fetch(`/api/community/${communitySlug}/promo-codes/${code.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !code.active }),
    });
    if (res.ok) load(); else toast.error('Failed to update code');
  }

  async function remove(code: PromoCodeWithUsage) {
    if (!confirm(`Delete code ${code.code}? Members already using it keep their discount.`)) return;
    const res = await fetch(`/api/community/${communitySlug}/promo-codes/${code.id}`, { method: 'DELETE' });
    if (res.ok) load(); else toast.error('Failed to delete code');
  }

  return (
    <div className="space-y-10">
      <form onSubmit={create} className="grid gap-4 max-w-xl rounded-lg border border-border p-5">
        <div className="grid gap-1">
          <label className="text-sm font-medium">Code</label>
          <input
            className="rounded-md border border-input bg-background px-3 py-2 text-sm uppercase"
            value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="SUMMER20" required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-1">
            <label className="text-sm font-medium">Discount type</label>
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.discountType}
              onChange={(e) => setForm({ ...form, discountType: e.target.value as CreatePromoCodeInput['discountType'] })}
            >
              <option value="percent">Percentage</option>
              <option value="amount">Fixed amount</option>
            </select>
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-medium">
              {form.discountType === 'percent' ? 'Percent off (1 to 100)' : 'Amount off'}
            </label>
            <input
              type="number" min={1} className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.discountValue}
              onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-1">
            <label className="text-sm font-medium">Applies to</label>
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: e.target.value as CreatePromoCodeInput['duration'] })}
            >
              <option value="once">First payment only</option>
              <option value="repeating">First N months</option>
            </select>
          </div>
          {form.duration === 'repeating' && (
            <div className="grid gap-1">
              <label className="text-sm font-medium">Number of months</label>
              <input
                type="number" min={1} className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.durationInMonths ?? 1}
                onChange={(e) => setForm({ ...form, durationInMonths: Number(e.target.value) })}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-1">
            <label className="text-sm font-medium">Max redemptions (optional)</label>
            <input
              type="number" min={1} className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.maxRedemptions ?? ''}
              onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-medium">Expires (optional)</label>
            <input
              type="date" className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.expiresAt ? form.expiresAt.slice(0, 10) : ''}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
          </div>
        </div>

        {yearlyEnabled && (
          <div className="grid gap-1">
            <label className="text-sm font-medium">Which plan can use this code?</label>
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.appliesToPlan ?? 'both'}
              onChange={(e) => setForm({ ...form, appliesToPlan: e.target.value as AppliesToPlan })}
            >
              <option value="both">Monthly and yearly</option>
              <option value="monthly">Monthly only</option>
              <option value="yearly">Yearly only</option>
            </select>
          </div>
        )}

        <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create code'}</Button>
      </form>

      <div>
        <h2 className="text-lg font-medium mb-3">Your codes</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : codes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No promo codes yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {codes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-mono font-medium">{c.code}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDiscountLabel({ discountType: c.discountType, discountValue: c.discountValue, currency: 'eur' })}
                    {', '}
                    {formatDurationLabel({ duration: c.duration, durationInMonths: c.durationInMonths })}
                    {c.maxRedemptions != null ? ` · ${c.timesRedeemed}/${c.maxRedemptions} used` : ` · ${c.timesRedeemed} used`}
                    {c.expiresAt ? ` · expires ${new Date(c.expiresAt).toLocaleDateString()}` : ''}
                    {c.appliesToPlan === 'yearly' ? ' · yearly only' : c.appliesToPlan === 'monthly' ? ' · monthly only' : ''}
                    {c.active ? '' : ' · paused'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => toggle(c)}>
                    {c.active ? 'Pause' : 'Resume'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(c)}>Delete</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
