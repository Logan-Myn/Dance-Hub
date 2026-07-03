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
