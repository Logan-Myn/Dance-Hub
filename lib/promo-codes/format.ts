import type { DiscountType, PromoDuration, DiscountPreview } from './types';

function formatMoney(value: number, currency: string): string {
  // Whole-number amounts render without decimals (e.g. €10); others keep 2dp.
  const fractionDigits = Number.isInteger(value) ? 0 : 2;
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDiscountLabel(args: {
  discountType: DiscountType;
  discountValue: number;
  currency: string;
}): string {
  if (args.discountType === 'percent') {
    return args.discountValue >= 100 ? 'Free' : `${args.discountValue}% off`;
  }
  return `${formatMoney(args.discountValue, args.currency)} off`;
}

export function formatDurationLabel(args: {
  duration: PromoDuration;
  durationInMonths: number | null;
}): string {
  if (args.duration === 'once') return 'first payment';
  const n = Number(args.durationInMonths);
  return `${n} ${n === 1 ? 'month' : 'months'}`;
}

export function buildPreview(args: {
  discountType: DiscountType;
  discountValue: number;
  currency: string;
  duration: PromoDuration;
  durationInMonths: number | null;
}): DiscountPreview {
  const discountLabel = formatDiscountLabel(args);
  const durationLabel = formatDurationLabel(args);
  const joiner = args.duration === 'once' ? 'first payment' : `for ${durationLabel}`;
  return { discountLabel, durationLabel, label: `${discountLabel} ${joiner}` };
}

/** The whole code in one sentence, for the owner: "20% off the first 3 months, monthly plan only, up to 10 uses, until 31 Dec". */
export function describePromo(args: {
  discountType: DiscountType;
  discountValue: number;
  duration: PromoDuration;
  durationInMonths: number | null;
  appliesToPlan?: 'both' | 'monthly' | 'yearly' | null;
  maxRedemptions?: number | null;
  expiresAt?: string | null;
}): string {
  const discount = formatDiscountLabel({ discountType: args.discountType, discountValue: args.discountValue, currency: 'eur' });
  const n = Number(args.durationInMonths);
  const span = args.duration === 'once' ? 'the first payment' : n === 1 ? 'the first month' : `the first ${n} months`;
  const parts = [discount === 'Free' ? `Free for ${span}` : `${discount} ${span}`];
  if (args.appliesToPlan === 'monthly') parts.push('monthly plan only');
  if (args.appliesToPlan === 'yearly') parts.push('yearly plan only');
  if (args.maxRedemptions) parts.push(`up to ${args.maxRedemptions} ${args.maxRedemptions === 1 ? 'use' : 'uses'}`);
  if (args.expiresAt) {
    parts.push(`until ${new Date(args.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`);
  }
  return parts.join(', ');
}
