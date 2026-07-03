export type DiscountType = 'percent' | 'amount';
export type PromoDuration = 'once' | 'repeating';

export interface CreatePromoCodeInput {
  code: string;
  discountType: DiscountType;
  discountValue: number; // percent 1-100, or amount in major units (e.g. 10 = €10)
  duration: PromoDuration;
  durationInMonths: number | null; // required when duration === 'repeating'
  maxRedemptions: number | null; // null = unlimited
  expiresAt: string | null; // ISO date string, or null
}

export interface PromoCodeRecord {
  id: string;
  communityId: string;
  code: string;
  stripeCouponId: string;
  stripePromotionCodeId: string;
  discountType: DiscountType;
  discountValue: number;
  duration: PromoDuration;
  durationInMonths: number | null;
  maxRedemptions: number | null;
  expiresAt: string | null;
  active: boolean;
  createdBy: string;
  createdAt: string;
}

export interface PromoCodeWithUsage extends PromoCodeRecord {
  timesRedeemed: number;
}

export interface DiscountPreview {
  discountLabel: string; // "20% off" | "€10 off" | "Free"
  durationLabel: string; // "first payment" | "3 months"
  label: string; // "20% off for 3 months"
}

export type ValidateResult =
  | { valid: false; reason: string }
  | { valid: true; promotionCodeId: string; preview: DiscountPreview };
