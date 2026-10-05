'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Tag, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { BTN_GHOST, BTN_PRIMARY } from '@/components/community-feed/feed-header';
import { Card, CardHead } from '@/components/community-admin/ui';
import { FIELD_INPUT, FIELD_LABEL } from '@/components/ds/app-dialog';
import { InlineConfirm } from '@/components/ds/inline-confirm';
import { Pill } from '@/components/ds/pill';
import { Skeleton } from '@/components/ds/skeleton';
import type { PromoCodeWithUsage, CreatePromoCodeInput, AppliesToPlan } from '@/lib/promo-codes/types';
import { describePromo } from '@/lib/promo-codes/format';
import { useNow } from '@/hooks/use-now';
import { cn } from '@/lib/utils';

const EMPTY: CreatePromoCodeInput = {
  code: '', discountType: 'percent', discountValue: 20,
  duration: 'once', durationInMonths: 3, maxRedemptions: null, expiresAt: null,
  appliesToPlan: 'both',
};

const SELECT = cn(FIELD_INPUT, 'h-10 py-0');

export function PromoCodesManager({ communitySlug, yearlyEnabled }: { communitySlug: string; yearlyEnabled: boolean }) {
  const [codes, setCodes] = useState<PromoCodeWithUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<CreatePromoCodeInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const now = useNow(60_000);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/community/${communitySlug}/promo-codes`);
      const data = await res.json();
      if (res.ok) setCodes(data.codes);
      else toast.error(data.error || "Couldn't load your codes. Reload the page.");
    } finally {
      setLoading(false);
    }
  }, [communitySlug]);

  useEffect(() => {
    void load();
  }, [load]);

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
      if (!res.ok) { toast.error(data.error || "Couldn't create the code. Try again."); return; }
      toast.success(`${payload.code.toUpperCase()} created`);
      setForm(EMPTY);
      void load();
    } finally {
      setSaving(false);
    }
  }

  async function toggle(code: PromoCodeWithUsage) {
    const res = await fetch(`/api/community/${communitySlug}/promo-codes/${code.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !code.active }),
    });
    if (res.ok) {
      toast.success(code.active ? `${code.code} turned off` : `${code.code} turned on`);
      void load();
    } else toast.error("Couldn't change the code. Try again.");
  }

  async function remove(code: PromoCodeWithUsage) {
    const res = await fetch(`/api/community/${communitySlug}/promo-codes/${code.id}`, { method: 'DELETE' });
    setDeleting(null);
    if (res.ok) {
      toast.success(`${code.code} deleted`);
      void load();
    } else toast.error("Couldn't delete the code. Try again.");
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`${code} copied`);
    } catch {
      toast.error("Couldn't copy. Your browser blocked it.");
    }
  }

  const usedUp = (c: PromoCodeWithUsage) => c.maxRedemptions != null && c.timesRedeemed >= c.maxRedemptions;
  const expired = (c: PromoCodeWithUsage) => !!now && !!c.expiresAt && new Date(c.expiresAt).getTime() < now.getTime();

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Card as="section" aria-labelledby="codes-h">
        <CardHead id="codes-h" title="Your codes" aside={codes.length ? `${codes.length}` : null} />
        {loading ? (
          <div className="flex flex-col gap-2.5 p-5">
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
          </div>
        ) : codes.length === 0 ? (
          <p className="px-5 pb-5 pt-2 text-[14.5px] text-ink-2">No codes yet. Create one, then share it with the dancers you want to invite.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {codes.map((c) => (
              <li key={c.id} className="flex flex-col gap-2.5 px-5 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="rounded-lg border border-dashed border-brand-line bg-brand-soft px-2.5 py-1 font-mono text-[13.5px] font-bold tracking-[0.06em] text-brand-ink">
                    {c.code}
                  </span>
                  <div className="min-w-0 flex-1">
                    <strong className="block text-[14px] font-semibold text-ink">{describePromo(c)}</strong>
                    <span className="text-[13px] tabular-nums text-ink-3">
                      {c.timesRedeemed}
                      {c.maxRedemptions != null ? ` of ${c.maxRedemptions}` : ''} used
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {c.active && !usedUp(c) && !expired(c) ? (
                      <Pill variant="ok">Active</Pill>
                    ) : (
                      <Pill variant="muted">{usedUp(c) ? 'Used up' : expired(c) ? 'Expired' : 'Off'}</Pill>
                    )}
                    <button type="button" onClick={() => copy(c.code)} aria-label={`Copy ${c.code}`} className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink">
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => toggle(c)} className={cn(BTN_GHOST, 'h-8 px-2.5 text-[13.5px]')}>
                      {c.active ? 'Turn off' : 'Turn on'}
                    </button>
                    <button type="button" onClick={() => setDeleting(c.id)} aria-label={`Delete ${c.code}`} className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 hover:bg-live-soft hover:text-live">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {deleting === c.id && (
                  <InlineConfirm title={`Delete ${c.code}?`} confirmLabel="Delete" cancelLabel="Keep it" onCancel={() => setDeleting(null)} onConfirm={() => void remove(c)}>
                    Members already using it keep their discount.
                  </InlineConfirm>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card as="section" aria-labelledby="new-code-h" className="p-5">
        <h2 id="new-code-h" className="font-display text-[17px] font-semibold text-ink">
          Create a code
        </h2>
        <form onSubmit={create} className="mt-3.5 flex flex-col gap-3.5">
          <div>
            <label htmlFor="pc-code" className={FIELD_LABEL}>Code</label>
            <input
              id="pc-code"
              className={cn(FIELD_INPUT, 'font-bold uppercase tracking-[0.06em]')}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="SHOWCASE15"
              autoComplete="off"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pc-type" className={FIELD_LABEL}>Discount</label>
              <select id="pc-type" className={SELECT} value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value as CreatePromoCodeInput['discountType'] })}>
                <option value="percent">Percent off</option>
                <option value="amount">Amount off, in €</option>
              </select>
            </div>
            <div>
              <label htmlFor="pc-value" className={FIELD_LABEL}>{form.discountType === 'percent' ? 'Percent' : 'Amount'}</label>
              <input
                id="pc-value"
                type="number"
                min={1}
                max={form.discountType === 'percent' ? 100 : undefined}
                className={FIELD_INPUT}
                value={form.discountValue}
                onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
                required
              />
            </div>
            <div>
              <label htmlFor="pc-duration" className={FIELD_LABEL}>Applies to</label>
              <select id="pc-duration" className={SELECT} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value as CreatePromoCodeInput['duration'] })}>
                <option value="once">The first payment</option>
                <option value="repeating">The first few months</option>
              </select>
            </div>
            {form.duration === 'repeating' ? (
              <div>
                <label htmlFor="pc-months" className={FIELD_LABEL}>Months</label>
                <input
                  id="pc-months"
                  type="number"
                  min={1}
                  max={24}
                  className={FIELD_INPUT}
                  value={form.durationInMonths ?? 1}
                  onChange={(e) => setForm({ ...form, durationInMonths: Number(e.target.value) })}
                />
              </div>
            ) : (
              <div aria-hidden="true" />
            )}
            <div>
              <label htmlFor="pc-max" className={FIELD_LABEL}>
                Max uses <span className="font-normal text-ink-3">optional</span>
              </label>
              <input
                id="pc-max"
                type="number"
                min={1}
                placeholder="No limit"
                className={FIELD_INPUT}
                value={form.maxRedemptions ?? ''}
                onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            <div>
              <label htmlFor="pc-exp" className={FIELD_LABEL}>
                Expires <span className="font-normal text-ink-3">optional</span>
              </label>
              <input
                id="pc-exp"
                type="date"
                className={FIELD_INPUT}
                value={form.expiresAt ? form.expiresAt.slice(0, 10) : ''}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
              />
            </div>
          </div>
          {yearlyEnabled && (
            <div>
              <label htmlFor="pc-plan" className={FIELD_LABEL}>Which plan can use it?</label>
              <select id="pc-plan" className={SELECT} value={form.appliesToPlan ?? 'both'} onChange={(e) => setForm({ ...form, appliesToPlan: e.target.value as AppliesToPlan })}>
                <option value="both">Monthly and yearly</option>
                <option value="monthly">Monthly only</option>
                <option value="yearly">Yearly only</option>
              </select>
            </div>
          )}
          <p className="flex items-center gap-2 text-[14px] text-ink">
            <Tag className="h-4 w-4 shrink-0 text-brand-ink" aria-hidden="true" />
            {describePromo({ ...form, durationInMonths: form.duration === 'repeating' ? form.durationInMonths : null })}
          </p>
          <button type="submit" disabled={saving || !form.code.trim()} className={cn(BTN_PRIMARY, 'self-start')}>
            {saving ? 'Creating…' : 'Create code'}
          </button>
        </form>
      </Card>
    </div>
  );
}
