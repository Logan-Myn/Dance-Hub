import type Stripe from 'stripe';
import type { CreatePromoCodeInput } from './types';

/** Returns an error message if the input is invalid, or null when valid. */
export function validateCreateInput(input: CreatePromoCodeInput): string | null {
  if (!input.code || !input.code.trim()) return 'A code is required';
  if (input.discountType === 'percent') {
    if (!(input.discountValue >= 1 && input.discountValue <= 100)) {
      return 'Percent must be between 1 and 100';
    }
  } else {
    if (!(input.discountValue > 0)) return 'Amount must be greater than 0';
  }
  if (input.duration === 'repeating' && !(Number(input.durationInMonths) >= 1)) {
    return 'Number of months is required for a repeating discount';
  }
  if (input.maxRedemptions != null && !(input.maxRedemptions >= 1)) {
    return 'Max redemptions must be at least 1';
  }
  if (input.appliesToPlan != null &&
      !['monthly', 'yearly', 'both'].includes(input.appliesToPlan)) {
    return 'Invalid plan scope';
  }
  return null;
}

export function buildCouponParams(
  input: CreatePromoCodeInput,
  currency: string | null,
): Stripe.CouponCreateParams {
  const duration: Stripe.CouponCreateParams =
    input.duration === 'repeating'
      ? { duration: 'repeating', duration_in_months: Number(input.durationInMonths) }
      : { duration: 'once' };

  if (input.discountType === 'percent') {
    return { percent_off: input.discountValue, ...duration };
  }
  if (!currency) throw new Error('currency is required for a fixed-amount coupon');
  return {
    amount_off: Math.round(input.discountValue * 100),
    currency,
    ...duration,
  };
}

export function buildPromotionCodeParams(
  input: CreatePromoCodeInput,
  couponId: string,
): Stripe.PromotionCodeCreateParams {
  // API 2025-12-15.clover nests the coupon under `promotion` (the pinned SDK
  // types still show the old top-level `coupon`, hence the cast on return).
  const params: Record<string, unknown> = {
    promotion: { type: 'coupon', coupon: couponId },
    code: input.code.trim(),
  };
  if (input.maxRedemptions != null) params.max_redemptions = input.maxRedemptions;
  if (input.expiresAt) params.expires_at = Math.floor(new Date(input.expiresAt).getTime() / 1000);
  return params as unknown as Stripe.PromotionCodeCreateParams;
}
