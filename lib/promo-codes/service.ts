import { stripe } from '@/lib/stripe';
import { sql, queryOne } from '@/lib/db';
import { buildCouponParams, buildPromotionCodeParams, validateCreateInput } from './coupon-params';
import { buildPreview } from './format';
import type {
  AppliesToPlan,
  CreatePromoCodeInput,
  PromoCodeRecord,
  PromoCodeWithUsage,
  ValidateResult,
} from './types';

export interface PromoCodeRow {
  id: string;
  community_id: string;
  code: string;
  stripe_coupon_id: string;
  stripe_promotion_code_id: string;
  discount_type: 'percent' | 'amount';
  discount_value: number;
  duration: 'once' | 'repeating';
  duration_in_months: number | null;
  max_redemptions: number | null;
  expires_at: string | null;
  applies_to_plan: AppliesToPlan;
  active: boolean;
  created_by: string;
  created_at: string;
}

export function rowToRecord(row: PromoCodeRow): PromoCodeRecord {
  return {
    id: row.id,
    communityId: row.community_id,
    code: row.code,
    stripeCouponId: row.stripe_coupon_id,
    stripePromotionCodeId: row.stripe_promotion_code_id,
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    duration: row.duration,
    durationInMonths: row.duration_in_months,
    maxRedemptions: row.max_redemptions,
    expiresAt: row.expires_at,
    appliesToPlan: (row.applies_to_plan ?? 'both') as AppliesToPlan,
    active: row.active,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function createPromoCode(args: {
  communityId: string;
  stripeAccountId: string;
  stripePriceId: string;
  createdBy: string;
  input: CreatePromoCodeInput;
}): Promise<PromoCodeRecord> {
  const problem = validateCreateInput(args.input);
  if (problem) throw new Error(problem);
  const code = args.input.code.trim();
  const stripeAccount = { stripeAccount: args.stripeAccountId };
  const duplicateName = () => new Error(`You already have a code called ${code}. Delete it to reuse the name.`);

  // Codes are matched regardless of case (Stripe does the same), and our
  // UNIQUE (community_id, code) also counts switched-off codes. Check before
  // creating anything on Stripe, so we never make a live code we can't store.
  const existing = await queryOne<{ id: string }>`
    SELECT id FROM community_promo_codes
    WHERE community_id = ${args.communityId}
      AND lower(code) = lower(${code})
    LIMIT 1
  `;
  if (existing) throw duplicateName();

  let currency: string | null = null;
  if (args.input.discountType === 'amount') {
    const price = await stripe.prices.retrieve(args.stripePriceId, stripeAccount);
    currency = price.currency;
  }

  const coupon = await stripe.coupons.create(
    buildCouponParams(args.input, currency),
    stripeAccount,
  );

  // From here on, undo what Stripe has if a later step fails, so no code is
  // left redeemable without a row the owner can see and switch off.
  const deleteCoupon = async () => {
    try {
      await stripe.coupons.del(coupon.id, stripeAccount);
    } catch (err) {
      console.error('[promo-codes] failed to delete coupon after a failed create', coupon.id, err);
    }
  };

  let promo: Awaited<ReturnType<typeof stripe.promotionCodes.create>>;
  try {
    promo = await stripe.promotionCodes.create(
      buildPromotionCodeParams(args.input, coupon.id),
      stripeAccount,
    );
  } catch (err) {
    await deleteCoupon();
    throw err;
  }

  let row: PromoCodeRow | null = null;
  let insertError: unknown = null;
  try {
    row = await queryOne<PromoCodeRow>`
      INSERT INTO community_promo_codes (
        community_id, code, stripe_coupon_id, stripe_promotion_code_id,
        discount_type, discount_value, duration, duration_in_months,
        max_redemptions, expires_at, active, created_by, applies_to_plan
      ) VALUES (
        ${args.communityId}, ${code}, ${coupon.id}, ${promo.id},
        ${args.input.discountType}, ${args.input.discountValue}, ${args.input.duration},
        ${args.input.durationInMonths}, ${args.input.maxRedemptions},
        ${args.input.expiresAt}, true, ${args.createdBy}, ${args.input.appliesToPlan ?? 'both'}
      )
      RETURNING *
    `;
  } catch (err) {
    insertError = err;
  }

  if (!row) {
    try {
      await stripe.promotionCodes.update(promo.id, { active: false }, stripeAccount);
    } catch (err) {
      console.error('[promo-codes] failed to switch off promotion code after a failed create', promo.id, err);
    }
    await deleteCoupon();
    // A unique violation means the same name was created at the same moment.
    if ((insertError as { code?: string } | null)?.code === '23505') throw duplicateName();
    throw insertError ?? new Error('Failed to persist promo code');
  }
  return rowToRecord(row);
}

export async function listPromoCodes(args: {
  communityId: string;
  stripeAccountId: string;
}): Promise<PromoCodeWithUsage[]> {
  const rows = await sql<PromoCodeRow[]>`
    SELECT * FROM community_promo_codes
    WHERE community_id = ${args.communityId}
    ORDER BY created_at DESC
  `;
  return Promise.all(
    rows.map(async (row) => {
      let timesRedeemed = 0;
      try {
        const promo = await stripe.promotionCodes.retrieve(row.stripe_promotion_code_id, {
          stripeAccount: args.stripeAccountId,
        });
        timesRedeemed = promo.times_redeemed ?? 0;
      } catch (err) {
        console.error('[promo-codes] failed to read redemptions', row.stripe_promotion_code_id, err);
      }
      return { ...rowToRecord(row), timesRedeemed };
    }),
  );
}

async function loadOwnedPromo(id: string, communityId: string): Promise<{ stripe_promotion_code_id: string }> {
  const row = await queryOne<{ stripe_promotion_code_id: string }>`
    SELECT stripe_promotion_code_id
    FROM community_promo_codes
    WHERE id = ${id} AND community_id = ${communityId}
  `;
  if (!row) throw new Error('Promo code not found');
  return row;
}

export async function setPromoCodeActive(args: {
  id: string;
  communityId: string;
  stripeAccountId: string;
  active: boolean;
}): Promise<void> {
  const row = await loadOwnedPromo(args.id, args.communityId);
  await stripe.promotionCodes.update(
    row.stripe_promotion_code_id,
    { active: args.active },
    { stripeAccount: args.stripeAccountId },
  );
  await sql`
    UPDATE community_promo_codes SET active = ${args.active} WHERE id = ${args.id}
  `;
}

export async function deletePromoCode(args: {
  id: string;
  communityId: string;
  stripeAccountId: string;
}): Promise<void> {
  const row = await loadOwnedPromo(args.id, args.communityId);
  // Stripe promotion codes cannot be hard-deleted; deactivate so no new
  // redemptions occur, then drop our mirror row so it leaves the owner's list.
  await stripe.promotionCodes.update(
    row.stripe_promotion_code_id,
    { active: false },
    { stripeAccount: args.stripeAccountId },
  );
  await sql`DELETE FROM community_promo_codes WHERE id = ${args.id}`;
}

export async function validatePromoCode(args: {
  stripeAccountId: string;
  code: string;
  communityId: string;
  plan?: 'monthly' | 'yearly';
}): Promise<ValidateResult> {
  const invalid: ValidateResult = { valid: false, reason: 'That code is not valid.' };
  const trimmed = args.code.trim();
  if (!trimmed) return invalid;

  // Look the code up in this community's mirror first, so unknown, switched
  // off or deleted codes are refused without calling Stripe. Stripe matches
  // codes regardless of case, so this does too.
  const mirror = await queryOne<{ stripe_promotion_code_id: string; applies_to_plan: string }>`
    SELECT stripe_promotion_code_id, applies_to_plan
    FROM community_promo_codes
    WHERE community_id = ${args.communityId}
      AND lower(code) = lower(${trimmed})
      AND active = true
    LIMIT 1
  `;
  if (!mirror) return invalid;

  // Per-plan scope (enforced in-app; monthly & yearly share one Stripe product).
  const plan = args.plan ?? 'monthly';
  const scope = mirror.applies_to_plan ?? 'both';
  if (scope !== 'both' && scope !== plan) {
    return {
      valid: false,
      reason: scope === 'yearly'
        ? 'This code only applies to the yearly plan.'
        : 'This code only applies to the monthly plan.',
    };
  }

  // Stripe stays the source of truth for redemptions, expiry and limits.
  const promo = await stripe.promotionCodes.retrieve(mirror.stripe_promotion_code_id, {
    stripeAccount: args.stripeAccountId,
  });
  if (!promo || !promo.active) return invalid;

  if (promo.expires_at && promo.expires_at * 1000 < Date.now()) return invalid;
  if (promo.max_redemptions != null && (promo.times_redeemed ?? 0) >= promo.max_redemptions) return invalid;

  // API 2025-12-15.clover no longer exposes an expanded `coupon` on the
  // promotion code; it carries the coupon id under `promotion.coupon`. Fetch
  // the coupon to read its discount shape for the preview.
  const couponId = (promo as any).promotion?.coupon as string | undefined;
  if (!couponId) return invalid;
  const coupon = await stripe.coupons.retrieve(couponId, { stripeAccount: args.stripeAccountId });
  if (coupon.valid === false) return invalid;

  // We only create 'once'/'repeating' coupons; guard against anything else.
  if (coupon.duration !== 'once' && coupon.duration !== 'repeating') return invalid;

  const preview = buildPreview({
    discountType: coupon.percent_off != null ? 'percent' : 'amount',
    discountValue: coupon.percent_off != null ? coupon.percent_off : (coupon.amount_off ?? 0) / 100,
    currency: coupon.currency ?? 'eur',
    duration: coupon.duration,
    durationInMonths: coupon.duration_in_months,
  });

  return { valid: true, promotionCodeId: promo.id, preview };
}
