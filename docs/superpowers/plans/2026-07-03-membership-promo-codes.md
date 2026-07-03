# Membership Promo Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a community owner create discount codes that new members redeem on the join screen, applied natively to the membership subscription on the owner's connected account.

**Architecture:** Each promo code is one Stripe Coupon (discount shape) plus one Stripe Promotion Code (customer-facing string + limits), both created on the community's connected account. A thin `community_promo_codes` table mirrors config and links codes to communities; Stripe remains the source of truth for redemption counting, expiry, and limits. New joiners enter a code on the join screen, it is validated against Stripe, and the resolved promotion code is attached to the subscription in `join-paid` via `discounts: [{ promotion_code }]`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, `postgres` (postgres.js) via `lib/db.ts`, Stripe Node SDK via `lib/stripe.ts` (API `2025-12-15.clover`), Stripe Connect direct charges, Jest (`bun run test`).

## Global Constraints

- Test runner is `bun run test` (Jest). NEVER `bun test` (Bun's runner gives false failures).
- Stripe API version is pinned in `lib/stripe.ts` (`2025-12-15.clover`); do not change it. Subscription discounts use the `discounts: [{ promotion_code }]` array, not the deprecated top-level `coupon`/`promotion_code`.
- All promo Coupon/Promotion Code/SetupIntent/Price calls are on the CONNECTED account: pass `{ stripeAccount: community.stripe_account_id }` as the second argument to every Stripe call.
- DB writes use `lib/db.ts` tagged templates (`sql`/`queryOne`). No jsonb columns in this feature, so the `sql.json()` double-encode rule does not apply here — all columns are scalar.
- Migrations are plain SQL files in `supabase/migrations/`, applied manually with `psql "$DATABASE_URL" -f <file>` against the local Postgres (`DATABASE_URL` from `.env.local`). There is no automated migration runner in `deploy.sh`.
- User-facing copy: no em dashes (use periods/commas); no payment-processor/vendor brand names in user-facing strings (describe the action, e.g. "promo code", never name the processor).
- Owner-only routes follow the `loadCommunityForOwner(slug, userId)` pattern in `app/api/community/[communitySlug]/payouts/schedule/route.ts` (getSession → 404 if no community → 403 if `created_by !== userId` → 400 if no `stripe_account_id`).
- Currency: `amount_off` coupons and preview formatting use the community's membership currency, resolved from its membership price via `stripe.prices.retrieve(stripe_price_id, { stripeAccount })`.

---

### Task 1: Database migration — `community_promo_codes` table

**Files:**
- Create: `supabase/migrations/2026-07-03_create_community_promo_codes.sql`

**Interfaces:**
- Produces: table `community_promo_codes` with columns used by all later tasks (see `PromoCodeRecord` in Task 2).

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/2026-07-03_create_community_promo_codes.sql`:

```sql
-- Membership promo codes. One row per code created by a community owner.
-- Mirrors two objects on the community's connected Stripe account:
--   stripe_coupon_id          -> the discount shape (percent/amount + duration)
--   stripe_promotion_code_id  -> the customer-facing code string + limits
-- Stripe is the source of truth for redemption counting/expiry/limits; this
-- table is for listing in the owner UI and linking codes to a community.
CREATE TABLE IF NOT EXISTS community_promo_codes (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id             uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  code                     text NOT NULL,                 -- customer-facing string, e.g. MARCELA20
  stripe_coupon_id         text NOT NULL,
  stripe_promotion_code_id text NOT NULL,
  discount_type            text NOT NULL CHECK (discount_type IN ('percent','amount')),
  discount_value           numeric NOT NULL,              -- percent (1-100) or amount in major units
  duration                 text NOT NULL CHECK (duration IN ('once','repeating')),
  duration_in_months       integer,                       -- null unless duration = 'repeating'
  max_redemptions          integer,                       -- null = unlimited
  expires_at               timestamptz,                   -- null = no expiry
  active                   boolean NOT NULL DEFAULT true,
  created_by               text NOT NULL,                 -- user id
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, code)
);

CREATE INDEX IF NOT EXISTS idx_community_promo_codes_community
  ON community_promo_codes (community_id);
```

- [ ] **Step 2: Apply the migration to the local database**

Run: `psql "$DATABASE_URL" -f supabase/migrations/2026-07-03_create_community_promo_codes.sql`
(Load `DATABASE_URL` from `.env.local` first, e.g. `set -a; . ./.env.local; set +a`.)
Expected: `CREATE TABLE` then `CREATE INDEX` with no errors. Re-running is safe (`IF NOT EXISTS`).

- [ ] **Step 3: Verify the table exists**

Run: `psql "$DATABASE_URL" -c "\d community_promo_codes"`
Expected: the column list above, a primary key on `id`, and the `UNIQUE (community_id, code)` constraint.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-07-03_create_community_promo_codes.sql
git commit -m "feat(promo-codes): add community_promo_codes table"
```

---

### Task 2: Types and pure Stripe-param mapping

**Files:**
- Create: `lib/promo-codes/types.ts`
- Create: `lib/promo-codes/coupon-params.ts`
- Test: `__tests__/lib/promo-codes/coupon-params.test.ts`

**Interfaces:**
- Produces (types.ts):

```ts
export type DiscountType = 'percent' | 'amount';
export type PromoDuration = 'once' | 'repeating';

export interface CreatePromoCodeInput {
  code: string;
  discountType: DiscountType;
  discountValue: number;              // percent 1-100, or amount in major units (e.g. 10 = €10)
  duration: PromoDuration;
  durationInMonths: number | null;    // required when duration === 'repeating'
  maxRedemptions: number | null;      // null = unlimited
  expiresAt: string | null;           // ISO date string, or null
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
  discountLabel: string;   // "20% off" | "€10 off" | "Free"
  durationLabel: string;   // "first payment" | "3 months"
  label: string;           // "20% off for 3 months"
}

export type ValidateResult =
  | { valid: false; reason: string }
  | { valid: true; promotionCodeId: string; preview: DiscountPreview };
```

- Produces (coupon-params.ts):
  - `buildCouponParams(input: CreatePromoCodeInput, currency: string | null): Stripe.CouponCreateParams`
  - `buildPromotionCodeParams(input: CreatePromoCodeInput, couponId: string): Stripe.PromotionCodeCreateParams`
  - `validateCreateInput(input: CreatePromoCodeInput): string | null` (returns an error message, or null when valid)

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/promo-codes/coupon-params.test.ts`:

```ts
import { buildCouponParams, buildPromotionCodeParams, validateCreateInput } from '@/lib/promo-codes/coupon-params';
import type { CreatePromoCodeInput } from '@/lib/promo-codes/types';

const base: CreatePromoCodeInput = {
  code: 'MARCELA20',
  discountType: 'percent',
  discountValue: 20,
  duration: 'repeating',
  durationInMonths: 3,
  maxRedemptions: 50,
  expiresAt: '2026-12-31T00:00:00.000Z',
};

describe('validateCreateInput', () => {
  it('accepts a valid percent repeating input', () => {
    expect(validateCreateInput(base)).toBeNull();
  });
  it('rejects empty code', () => {
    expect(validateCreateInput({ ...base, code: '  ' })).toMatch(/code/i);
  });
  it('rejects percent out of 1-100', () => {
    expect(validateCreateInput({ ...base, discountValue: 0 })).toMatch(/percent/i);
    expect(validateCreateInput({ ...base, discountValue: 150 })).toMatch(/percent/i);
  });
  it('rejects non-positive amount', () => {
    expect(validateCreateInput({ ...base, discountType: 'amount', discountValue: 0 })).toMatch(/amount/i);
  });
  it('rejects repeating without months', () => {
    expect(validateCreateInput({ ...base, durationInMonths: null })).toMatch(/months/i);
  });
});

describe('buildCouponParams', () => {
  it('maps a percent repeating code', () => {
    expect(buildCouponParams(base, null)).toEqual({
      percent_off: 20,
      duration: 'repeating',
      duration_in_months: 3,
    });
  });
  it('maps a fixed-amount once code into minor units with currency', () => {
    expect(buildCouponParams(
      { ...base, discountType: 'amount', discountValue: 10, duration: 'once', durationInMonths: null },
      'eur',
    )).toEqual({
      amount_off: 1000,
      currency: 'eur',
      duration: 'once',
    });
  });
  it('maps a free (100%) code', () => {
    expect(buildCouponParams({ ...base, discountValue: 100 }, null)).toMatchObject({ percent_off: 100 });
  });
});

describe('buildPromotionCodeParams', () => {
  it('maps code string, coupon, expiry (unix), and max redemptions', () => {
    expect(buildPromotionCodeParams(base, 'coupon_1')).toEqual({
      coupon: 'coupon_1',
      code: 'MARCELA20',
      max_redemptions: 50,
      expires_at: Math.floor(new Date('2026-12-31T00:00:00.000Z').getTime() / 1000),
    });
  });
  it('omits optional limits when null', () => {
    expect(buildPromotionCodeParams(
      { ...base, maxRedemptions: null, expiresAt: null }, 'coupon_1',
    )).toEqual({ coupon: 'coupon_1', code: 'MARCELA20' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test __tests__/lib/promo-codes/coupon-params.test.ts`
Expected: FAIL — cannot find module `@/lib/promo-codes/coupon-params`.

- [ ] **Step 3: Write `types.ts` then `coupon-params.ts`**

Create `lib/promo-codes/types.ts` with the type block from the Interfaces section above.

Create `lib/promo-codes/coupon-params.ts`:

```ts
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
  const params: Stripe.PromotionCodeCreateParams = {
    coupon: couponId,
    code: input.code.trim(),
  };
  if (input.maxRedemptions != null) params.max_redemptions = input.maxRedemptions;
  if (input.expiresAt) params.expires_at = Math.floor(new Date(input.expiresAt).getTime() / 1000);
  return params;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test __tests__/lib/promo-codes/coupon-params.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/promo-codes/types.ts lib/promo-codes/coupon-params.ts __tests__/lib/promo-codes/coupon-params.test.ts
git commit -m "feat(promo-codes): types and Stripe-param mapping"
```

---

### Task 3: Pure display formatting

**Files:**
- Create: `lib/promo-codes/format.ts`
- Test: `__tests__/lib/promo-codes/format.test.ts`

**Interfaces:**
- Consumes: `DiscountType`, `PromoDuration`, `DiscountPreview` from `./types`.
- Produces:
  - `formatDiscountLabel(args: { discountType: DiscountType; discountValue: number; currency: string }): string`
  - `formatDurationLabel(args: { duration: PromoDuration; durationInMonths: number | null }): string`
  - `buildPreview(args: { discountType: DiscountType; discountValue: number; currency: string; duration: PromoDuration; durationInMonths: number | null }): DiscountPreview`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/promo-codes/format.test.ts`:

```ts
import { formatDiscountLabel, formatDurationLabel, buildPreview } from '@/lib/promo-codes/format';

describe('formatDiscountLabel', () => {
  it('formats a percentage', () => {
    expect(formatDiscountLabel({ discountType: 'percent', discountValue: 20, currency: 'eur' })).toBe('20% off');
  });
  it('formats a free code', () => {
    expect(formatDiscountLabel({ discountType: 'percent', discountValue: 100, currency: 'eur' })).toBe('Free');
  });
  it('formats a fixed amount in the community currency', () => {
    expect(formatDiscountLabel({ discountType: 'amount', discountValue: 10, currency: 'eur' })).toBe('€10 off');
  });
});

describe('formatDurationLabel', () => {
  it('labels once', () => {
    expect(formatDurationLabel({ duration: 'once', durationInMonths: null })).toBe('first payment');
  });
  it('labels repeating', () => {
    expect(formatDurationLabel({ duration: 'repeating', durationInMonths: 3 })).toBe('3 months');
    expect(formatDurationLabel({ duration: 'repeating', durationInMonths: 1 })).toBe('1 month');
  });
});

describe('buildPreview', () => {
  it('joins discount and duration without em dashes', () => {
    const p = buildPreview({ discountType: 'percent', discountValue: 20, currency: 'eur', duration: 'repeating', durationInMonths: 3 });
    expect(p.label).toBe('20% off for 3 months');
    expect(p.label).not.toMatch(/—/);
  });
  it('labels a first-payment discount', () => {
    expect(buildPreview({ discountType: 'amount', discountValue: 10, currency: 'eur', duration: 'once', durationInMonths: null }).label)
      .toBe('€10 off first payment');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test __tests__/lib/promo-codes/format.test.ts`
Expected: FAIL — cannot find module `@/lib/promo-codes/format`.

- [ ] **Step 3: Write `format.ts`**

Create `lib/promo-codes/format.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test __tests__/lib/promo-codes/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/promo-codes/format.ts __tests__/lib/promo-codes/format.test.ts
git commit -m "feat(promo-codes): display formatting helpers"
```

---

### Task 4: Service — create a promo code

**Files:**
- Create: `lib/promo-codes/service.ts`
- Test: `__tests__/lib/promo-codes/service-create.test.ts`

**Interfaces:**
- Consumes: `buildCouponParams`, `buildPromotionCodeParams`, `validateCreateInput` (Task 2); `stripe` from `@/lib/stripe`; `sql`, `queryOne` from `@/lib/db`.
- Produces:

```ts
export async function createPromoCode(args: {
  communityId: string;
  stripeAccountId: string;
  stripePriceId: string;
  createdBy: string;
  input: CreatePromoCodeInput;
}): Promise<PromoCodeRecord>;

// internal, exported for reuse by other service functions:
export function rowToRecord(row: PromoCodeRow): PromoCodeRecord;
export interface PromoCodeRow { /* snake_case DB columns, see below */ }
```

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/promo-codes/service-create.test.ts`:

```ts
import { createPromoCode } from '@/lib/promo-codes/service';

const mockCouponsCreate = jest.fn();
const mockPromoCreate = jest.fn();
const mockPricesRetrieve = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    coupons: { create: (...a: unknown[]) => mockCouponsCreate(...a) },
    promotionCodes: { create: (...a: unknown[]) => mockPromoCreate(...a) },
    prices: { retrieve: (...a: unknown[]) => mockPricesRetrieve(...a) },
  },
}));

const mockSql = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: (...a: unknown[]) => mockSql(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
}));

beforeEach(() => {
  [mockCouponsCreate, mockPromoCreate, mockPricesRetrieve, mockSql, mockQueryOne].forEach((m) => m.mockReset());
});

const args = {
  communityId: 'c1',
  stripeAccountId: 'acct_1',
  stripePriceId: 'price_1',
  createdBy: 'user_1',
  input: {
    code: 'MARCELA20', discountType: 'percent' as const, discountValue: 20,
    duration: 'repeating' as const, durationInMonths: 3, maxRedemptions: 50, expiresAt: null,
  },
};

it('creates coupon + promotion code on the connected account and inserts a row', async () => {
  mockCouponsCreate.mockResolvedValueOnce({ id: 'coupon_1' });
  mockPromoCreate.mockResolvedValueOnce({ id: 'promo_1' });
  mockQueryOne.mockResolvedValueOnce({
    id: 'row_1', community_id: 'c1', code: 'MARCELA20',
    stripe_coupon_id: 'coupon_1', stripe_promotion_code_id: 'promo_1',
    discount_type: 'percent', discount_value: 20, duration: 'repeating',
    duration_in_months: 3, max_redemptions: 50, expires_at: null,
    active: true, created_by: 'user_1', created_at: '2026-07-03T00:00:00.000Z',
  });

  const rec = await createPromoCode(args);

  expect(mockCouponsCreate).toHaveBeenCalledWith(
    expect.objectContaining({ percent_off: 20, duration: 'repeating', duration_in_months: 3 }),
    { stripeAccount: 'acct_1' },
  );
  expect(mockPromoCreate).toHaveBeenCalledWith(
    expect.objectContaining({ coupon: 'coupon_1', code: 'MARCELA20', max_redemptions: 50 }),
    { stripeAccount: 'acct_1' },
  );
  expect(mockPricesRetrieve).not.toHaveBeenCalled(); // percent needs no currency
  expect(rec.stripePromotionCodeId).toBe('promo_1');
  expect(rec.code).toBe('MARCELA20');
});

it('resolves currency from the membership price for amount codes', async () => {
  mockPricesRetrieve.mockResolvedValueOnce({ currency: 'eur' });
  mockCouponsCreate.mockResolvedValueOnce({ id: 'coupon_2' });
  mockPromoCreate.mockResolvedValueOnce({ id: 'promo_2' });
  mockQueryOne.mockResolvedValueOnce({
    id: 'row_2', community_id: 'c1', code: 'TEN', stripe_coupon_id: 'coupon_2',
    stripe_promotion_code_id: 'promo_2', discount_type: 'amount', discount_value: 10,
    duration: 'once', duration_in_months: null, max_redemptions: null, expires_at: null,
    active: true, created_by: 'user_1', created_at: '2026-07-03T00:00:00.000Z',
  });

  await createPromoCode({
    ...args,
    input: { ...args.input, discountType: 'amount', discountValue: 10, duration: 'once', durationInMonths: null },
  });

  expect(mockPricesRetrieve).toHaveBeenCalledWith('price_1', { stripeAccount: 'acct_1' });
  expect(mockCouponsCreate).toHaveBeenCalledWith(
    expect.objectContaining({ amount_off: 1000, currency: 'eur', duration: 'once' }),
    { stripeAccount: 'acct_1' },
  );
});

it('rejects invalid input before calling Stripe', async () => {
  await expect(createPromoCode({ ...args, input: { ...args.input, code: '' } }))
    .rejects.toThrow(/code/i);
  expect(mockCouponsCreate).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test __tests__/lib/promo-codes/service-create.test.ts`
Expected: FAIL — cannot find `createPromoCode`.

- [ ] **Step 3: Write `service.ts` (create + row mapping)**

Create `lib/promo-codes/service.ts`:

```ts
import { stripe } from '@/lib/stripe';
import { sql, queryOne } from '@/lib/db';
import { buildCouponParams, buildPromotionCodeParams, validateCreateInput } from './coupon-params';
import type { CreatePromoCodeInput, PromoCodeRecord } from './types';

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

  let currency: string | null = null;
  if (args.input.discountType === 'amount') {
    const price = await stripe.prices.retrieve(args.stripePriceId, {
      stripeAccount: args.stripeAccountId,
    });
    currency = price.currency;
  }

  const coupon = await stripe.coupons.create(
    buildCouponParams(args.input, currency),
    { stripeAccount: args.stripeAccountId },
  );

  const promo = await stripe.promotionCodes.create(
    buildPromotionCodeParams(args.input, coupon.id),
    { stripeAccount: args.stripeAccountId },
  );

  const row = await queryOne<PromoCodeRow>`
    INSERT INTO community_promo_codes (
      community_id, code, stripe_coupon_id, stripe_promotion_code_id,
      discount_type, discount_value, duration, duration_in_months,
      max_redemptions, expires_at, active, created_by
    ) VALUES (
      ${args.communityId}, ${args.input.code.trim()}, ${coupon.id}, ${promo.id},
      ${args.input.discountType}, ${args.input.discountValue}, ${args.input.duration},
      ${args.input.durationInMonths}, ${args.input.maxRedemptions},
      ${args.input.expiresAt}, true, ${args.createdBy}
    )
    RETURNING *
  `;
  if (!row) throw new Error('Failed to persist promo code');
  return rowToRecord(row);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test __tests__/lib/promo-codes/service-create.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/promo-codes/service.ts __tests__/lib/promo-codes/service-create.test.ts
git commit -m "feat(promo-codes): create service (coupon + promotion code + row)"
```

---

### Task 5: Service — list promo codes with live redemption counts

**Files:**
- Modify: `lib/promo-codes/service.ts`
- Test: `__tests__/lib/promo-codes/service-list.test.ts`

**Interfaces:**
- Produces: `listPromoCodes(args: { communityId: string; stripeAccountId: string }): Promise<PromoCodeWithUsage[]>`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/promo-codes/service-list.test.ts`:

```ts
import { listPromoCodes } from '@/lib/promo-codes/service';

const mockPromoRetrieve = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: { promotionCodes: { retrieve: (...a: unknown[]) => mockPromoRetrieve(...a) } },
}));
const mockSql = jest.fn();
jest.mock('@/lib/db', () => ({ sql: (...a: unknown[]) => mockSql(...a), queryOne: jest.fn() }));

beforeEach(() => { mockPromoRetrieve.mockReset(); mockSql.mockReset(); });

it('returns rows enriched with live times_redeemed from Stripe', async () => {
  mockSql.mockResolvedValueOnce([
    { id: 'row_1', community_id: 'c1', code: 'A', stripe_coupon_id: 'co_1',
      stripe_promotion_code_id: 'promo_1', discount_type: 'percent', discount_value: 20,
      duration: 'once', duration_in_months: null, max_redemptions: 50, expires_at: null,
      active: true, created_by: 'u1', created_at: '2026-07-03T00:00:00.000Z' },
  ]);
  mockPromoRetrieve.mockResolvedValueOnce({ id: 'promo_1', times_redeemed: 7 });

  const list = await listPromoCodes({ communityId: 'c1', stripeAccountId: 'acct_1' });

  expect(mockPromoRetrieve).toHaveBeenCalledWith('promo_1', { stripeAccount: 'acct_1' });
  expect(list[0]).toMatchObject({ code: 'A', timesRedeemed: 7, maxRedemptions: 50 });
});

it('falls back to 0 redemptions if a Stripe lookup fails', async () => {
  mockSql.mockResolvedValueOnce([
    { id: 'row_2', community_id: 'c1', code: 'B', stripe_coupon_id: 'co_2',
      stripe_promotion_code_id: 'promo_2', discount_type: 'percent', discount_value: 10,
      duration: 'once', duration_in_months: null, max_redemptions: null, expires_at: null,
      active: true, created_by: 'u1', created_at: '2026-07-03T00:00:00.000Z' },
  ]);
  mockPromoRetrieve.mockRejectedValueOnce(new Error('stripe down'));

  const list = await listPromoCodes({ communityId: 'c1', stripeAccountId: 'acct_1' });
  expect(list[0].timesRedeemed).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test __tests__/lib/promo-codes/service-list.test.ts`
Expected: FAIL — `listPromoCodes` is not exported.

- [ ] **Step 3: Add `listPromoCodes` to `service.ts`**

Append to `lib/promo-codes/service.ts` (and add `PromoCodeWithUsage` to the type import):

```ts
export async function listPromoCodes(args: {
  communityId: string;
  stripeAccountId: string;
}): Promise<import('./types').PromoCodeWithUsage[]> {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test __tests__/lib/promo-codes/service-list.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/promo-codes/service.ts __tests__/lib/promo-codes/service-list.test.ts
git commit -m "feat(promo-codes): list service with live redemption counts"
```

---

### Task 6: Service — activate/deactivate and delete

**Files:**
- Modify: `lib/promo-codes/service.ts`
- Test: `__tests__/lib/promo-codes/service-toggle.test.ts`

**Interfaces:**
- Produces:
  - `setPromoCodeActive(args: { id: string; communityId: string; stripeAccountId: string; active: boolean }): Promise<void>`
  - `deletePromoCode(args: { id: string; communityId: string; stripeAccountId: string }): Promise<void>` (deactivates on Stripe, then deletes the mirror row)

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/promo-codes/service-toggle.test.ts`:

```ts
import { setPromoCodeActive, deletePromoCode } from '@/lib/promo-codes/service';

const mockPromoUpdate = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: { promotionCodes: { update: (...a: unknown[]) => mockPromoUpdate(...a) } },
}));
const mockSql = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: (...a: unknown[]) => mockSql(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
}));

beforeEach(() => { mockPromoUpdate.mockReset(); mockSql.mockReset(); mockQueryOne.mockReset(); });

it('deactivates on Stripe and updates the row (scoped to community)', async () => {
  mockQueryOne.mockResolvedValueOnce({ stripe_promotion_code_id: 'promo_1' });
  mockPromoUpdate.mockResolvedValueOnce({});
  mockSql.mockResolvedValueOnce([]);

  await setPromoCodeActive({ id: 'row_1', communityId: 'c1', stripeAccountId: 'acct_1', active: false });

  expect(mockPromoUpdate).toHaveBeenCalledWith('promo_1', { active: false }, { stripeAccount: 'acct_1' });
});

it('throws when the code does not belong to the community', async () => {
  mockQueryOne.mockResolvedValueOnce(null);
  await expect(setPromoCodeActive({ id: 'x', communityId: 'c1', stripeAccountId: 'acct_1', active: false }))
    .rejects.toThrow(/not found/i);
  expect(mockPromoUpdate).not.toHaveBeenCalled();
});

it('delete deactivates on Stripe then removes the row', async () => {
  mockQueryOne.mockResolvedValueOnce({ stripe_promotion_code_id: 'promo_1' });
  mockPromoUpdate.mockResolvedValueOnce({});
  mockSql.mockResolvedValueOnce([]);

  await deletePromoCode({ id: 'row_1', communityId: 'c1', stripeAccountId: 'acct_1' });

  expect(mockPromoUpdate).toHaveBeenCalledWith('promo_1', { active: false }, { stripeAccount: 'acct_1' });
  const sqlText = mockSql.mock.calls[0][0].join('?');
  expect(sqlText).toMatch(/DELETE FROM community_promo_codes/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test __tests__/lib/promo-codes/service-toggle.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Add the functions to `service.ts`**

Append to `lib/promo-codes/service.ts`:

```ts
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
  id: string; communityId: string; stripeAccountId: string; active: boolean;
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
  id: string; communityId: string; stripeAccountId: string;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test __tests__/lib/promo-codes/service-toggle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/promo-codes/service.ts __tests__/lib/promo-codes/service-toggle.test.ts
git commit -m "feat(promo-codes): activate/deactivate and delete service"
```

---

### Task 7: Service — validate a code (public, for the join screen)

**Files:**
- Modify: `lib/promo-codes/service.ts`
- Test: `__tests__/lib/promo-codes/service-validate.test.ts`

**Interfaces:**
- Consumes: `buildPreview` (Task 3).
- Produces: `validatePromoCode(args: { stripeAccountId: string; code: string }): Promise<ValidateResult>`
  - Looks up an active promotion code by string on the connected account, checks expiry and remaining redemptions, and returns a generic invalid result or a preview + `promotionCodeId`. The preview is derived from the promotion code's expanded coupon.

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/promo-codes/service-validate.test.ts`:

```ts
import { validatePromoCode } from '@/lib/promo-codes/service';

const mockPromoList = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: { promotionCodes: { list: (...a: unknown[]) => mockPromoList(...a) } },
}));
jest.mock('@/lib/db', () => ({ sql: jest.fn(), queryOne: jest.fn() }));

beforeEach(() => mockPromoList.mockReset());

it('returns a preview for a valid percent repeating code', async () => {
  mockPromoList.mockResolvedValueOnce({
    data: [{
      id: 'promo_1', active: true, expires_at: null, max_redemptions: null, times_redeemed: 0,
      coupon: { valid: true, percent_off: 20, amount_off: null, currency: null, duration: 'repeating', duration_in_months: 3 },
    }],
  });

  const res = await validatePromoCode({ stripeAccountId: 'acct_1', code: 'marcela20' });

  expect(mockPromoList).toHaveBeenCalledWith(
    { code: 'marcela20', active: true, limit: 1 },
    { stripeAccount: 'acct_1' },
  );
  expect(res).toEqual({
    valid: true,
    promotionCodeId: 'promo_1',
    preview: { discountLabel: '20% off', durationLabel: '3 months', label: '20% off for 3 months' },
  });
});

it('is invalid when no code matches', async () => {
  mockPromoList.mockResolvedValueOnce({ data: [] });
  const res = await validatePromoCode({ stripeAccountId: 'acct_1', code: 'nope' });
  expect(res).toEqual({ valid: false, reason: expect.any(String) });
});

it('is invalid when max redemptions reached', async () => {
  mockPromoList.mockResolvedValueOnce({
    data: [{ id: 'p', active: true, expires_at: null, max_redemptions: 5, times_redeemed: 5,
      coupon: { valid: true, percent_off: 10, duration: 'once' } }],
  });
  const res = await validatePromoCode({ stripeAccountId: 'acct_1', code: 'maxed' });
  expect(res).toEqual({ valid: false, reason: expect.any(String) });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test __tests__/lib/promo-codes/service-validate.test.ts`
Expected: FAIL — `validatePromoCode` not exported.

- [ ] **Step 3: Add `validatePromoCode` to `service.ts`**

Append to `lib/promo-codes/service.ts` (add `import { buildPreview } from './format';` and `import type { ValidateResult } from './types';` at the top):

```ts
export async function validatePromoCode(args: {
  stripeAccountId: string;
  code: string;
}): Promise<ValidateResult> {
  const invalid: ValidateResult = { valid: false, reason: 'That code is not valid.' };
  const trimmed = args.code.trim();
  if (!trimmed) return invalid;

  const list = await stripe.promotionCodes.list(
    { code: trimmed, active: true, limit: 1 },
    { stripeAccount: args.stripeAccountId },
  );
  const promo = list.data[0];
  if (!promo || !promo.active) return invalid;

  const coupon = promo.coupon as {
    valid?: boolean; percent_off: number | null; amount_off: number | null;
    currency: string | null; duration: 'once' | 'repeating' | 'forever'; duration_in_months: number | null;
  };
  if (coupon.valid === false) return invalid;

  if (promo.expires_at && promo.expires_at * 1000 < Date.now()) return invalid;
  if (promo.max_redemptions != null && (promo.times_redeemed ?? 0) >= promo.max_redemptions) return invalid;

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test __tests__/lib/promo-codes/service-validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/promo-codes/service.ts __tests__/lib/promo-codes/service-validate.test.ts
git commit -m "feat(promo-codes): validate service for the join screen"
```

---

### Task 8: API route — list + create (`/promo-codes`)

**Files:**
- Create: `app/api/community/[communitySlug]/promo-codes/route.ts`
- Test: `__tests__/api/promo-codes/collection-route.test.ts`

**Interfaces:**
- Consumes: `createPromoCode`, `listPromoCodes` (service); `getSession`; `queryOne`.
- Produces: `GET` → `{ codes: PromoCodeWithUsage[] }`; `POST` (body = `CreatePromoCodeInput`) → `{ code: PromoCodeRecord }`. Both owner-only.

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/promo-codes/collection-route.test.ts`:

```ts
import { GET, POST } from '@/app/api/community/[communitySlug]/promo-codes/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({ queryOne: (...a: unknown[]) => mockQueryOne(...a), sql: jest.fn() }));
const mockCreate = jest.fn();
const mockList = jest.fn();
jest.mock('@/lib/promo-codes/service', () => ({
  createPromoCode: (...a: unknown[]) => mockCreate(...a),
  listPromoCodes: (...a: unknown[]) => mockList(...a),
}));

const params = Promise.resolve({ communitySlug: 'salsa' });
const community = { id: 'c1', created_by: 'owner1', stripe_account_id: 'acct_1', stripe_price_id: 'price_1' };

beforeEach(() => { mockGetSession.mockReset(); mockQueryOne.mockReset(); mockCreate.mockReset(); mockList.mockReset(); });

it('GET returns 401 without a session', async () => {
  mockGetSession.mockResolvedValueOnce(null);
  const res = await GET(new Request('http://x'), { params });
  expect(res.status).toBe(401);
});

it('GET returns 403 for a non-owner', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'someone' } });
  mockQueryOne.mockResolvedValueOnce(community);
  const res = await GET(new Request('http://x'), { params });
  expect(res.status).toBe(403);
});

it('GET returns the code list for the owner', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'owner1' } });
  mockQueryOne.mockResolvedValueOnce(community);
  mockList.mockResolvedValueOnce([{ id: 'row_1', code: 'A' }]);
  const res = await GET(new Request('http://x'), { params });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ codes: [{ id: 'row_1', code: 'A' }] });
  expect(mockList).toHaveBeenCalledWith({ communityId: 'c1', stripeAccountId: 'acct_1' });
});

it('POST creates a code for the owner', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'owner1' } });
  mockQueryOne.mockResolvedValueOnce(community);
  mockCreate.mockResolvedValueOnce({ id: 'row_1', code: 'MARCELA20' });
  const body = {
    code: 'MARCELA20', discountType: 'percent', discountValue: 20,
    duration: 'repeating', durationInMonths: 3, maxRedemptions: 50, expiresAt: null,
  };
  const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }), { params });
  expect(res.status).toBe(200);
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
    communityId: 'c1', stripeAccountId: 'acct_1', stripePriceId: 'price_1', createdBy: 'owner1',
    input: expect.objectContaining({ code: 'MARCELA20' }),
  }));
});

it('POST returns 400 when the service rejects invalid input', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'owner1' } });
  mockQueryOne.mockResolvedValueOnce(community);
  mockCreate.mockRejectedValueOnce(new Error('Percent must be between 1 and 100'));
  const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({}) }), { params });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test __tests__/api/promo-codes/collection-route.test.ts`
Expected: FAIL — route module does not exist.

- [ ] **Step 3: Write the route**

Create `app/api/community/[communitySlug]/promo-codes/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';
import { createPromoCode, listPromoCodes } from '@/lib/promo-codes/service';
import type { CreatePromoCodeInput } from '@/lib/promo-codes/types';

interface OwnerCommunity {
  id: string;
  created_by: string;
  stripe_account_id: string | null;
  stripe_price_id: string | null;
}

async function loadOwner(slug: string, userId: string) {
  const row = await queryOne<OwnerCommunity>`
    SELECT id, created_by, stripe_account_id, stripe_price_id
    FROM communities WHERE slug = ${slug}
  `;
  if (!row) return { error: NextResponse.json({ error: 'Community not found' }, { status: 404 }) };
  if (row.created_by !== userId) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  if (!row.stripe_account_id) return { error: NextResponse.json({ error: 'Payments not set up' }, { status: 400 }) };
  return { row };
}

export async function GET(_req: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await props.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await loadOwner(communitySlug, session.user.id);
  if ('error' in result) return result.error;
  try {
    const codes = await listPromoCodes({ communityId: result.row.id, stripeAccountId: result.row.stripe_account_id! });
    return NextResponse.json({ codes });
  } catch (err) {
    console.error('[promo-codes] list failed', err);
    return NextResponse.json({ error: 'Failed to load promo codes' }, { status: 500 });
  }
}

export async function POST(req: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await props.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await loadOwner(communitySlug, session.user.id);
  if ('error' in result) return result.error;
  if (!result.row.stripe_price_id) {
    return NextResponse.json({ error: 'Set a membership price before creating promo codes' }, { status: 400 });
  }
  try {
    const input = (await req.json()) as CreatePromoCodeInput;
    const code = await createPromoCode({
      communityId: result.row.id,
      stripeAccountId: result.row.stripe_account_id!,
      stripePriceId: result.row.stripe_price_id,
      createdBy: session.user.id,
      input,
    });
    return NextResponse.json({ code });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create promo code';
    console.error('[promo-codes] create failed', err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test __tests__/api/promo-codes/collection-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/community/[communitySlug]/promo-codes/route.ts" __tests__/api/promo-codes/collection-route.test.ts
git commit -m "feat(promo-codes): list + create API route"
```

---

### Task 9: API route — activate/deactivate + delete (`/promo-codes/[id]`)

**Files:**
- Create: `app/api/community/[communitySlug]/promo-codes/[id]/route.ts`
- Test: `__tests__/api/promo-codes/item-route.test.ts`

**Interfaces:**
- Consumes: `setPromoCodeActive`, `deletePromoCode` (service); `getSession`; `queryOne`.
- Produces: `PATCH` (body `{ active: boolean }`) → `{ ok: true }`; `DELETE` → `{ ok: true }`. Owner-only.

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/promo-codes/item-route.test.ts`:

```ts
import { PATCH, DELETE } from '@/app/api/community/[communitySlug]/promo-codes/[id]/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({ queryOne: (...a: unknown[]) => mockQueryOne(...a), sql: jest.fn() }));
const mockSetActive = jest.fn();
const mockDelete = jest.fn();
jest.mock('@/lib/promo-codes/service', () => ({
  setPromoCodeActive: (...a: unknown[]) => mockSetActive(...a),
  deletePromoCode: (...a: unknown[]) => mockDelete(...a),
}));

const params = Promise.resolve({ communitySlug: 'salsa', id: 'row_1' });
const community = { id: 'c1', created_by: 'owner1', stripe_account_id: 'acct_1' };

beforeEach(() => { mockGetSession.mockReset(); mockQueryOne.mockReset(); mockSetActive.mockReset(); mockDelete.mockReset(); });

it('PATCH deactivates for the owner', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'owner1' } });
  mockQueryOne.mockResolvedValueOnce(community);
  mockSetActive.mockResolvedValueOnce(undefined);
  const res = await PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ active: false }) }), { params });
  expect(res.status).toBe(200);
  expect(mockSetActive).toHaveBeenCalledWith({ id: 'row_1', communityId: 'c1', stripeAccountId: 'acct_1', active: false });
});

it('PATCH returns 403 for a non-owner', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'intruder' } });
  mockQueryOne.mockResolvedValueOnce(community);
  const res = await PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ active: false }) }), { params });
  expect(res.status).toBe(403);
  expect(mockSetActive).not.toHaveBeenCalled();
});

it('DELETE removes the code for the owner', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'owner1' } });
  mockQueryOne.mockResolvedValueOnce(community);
  mockDelete.mockResolvedValueOnce(undefined);
  const res = await DELETE(new Request('http://x', { method: 'DELETE' }), { params });
  expect(res.status).toBe(200);
  expect(mockDelete).toHaveBeenCalledWith({ id: 'row_1', communityId: 'c1', stripeAccountId: 'acct_1' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test __tests__/api/promo-codes/item-route.test.ts`
Expected: FAIL — route module does not exist.

- [ ] **Step 3: Write the route**

Create `app/api/community/[communitySlug]/promo-codes/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';
import { setPromoCodeActive, deletePromoCode } from '@/lib/promo-codes/service';

interface OwnerCommunity { id: string; created_by: string; stripe_account_id: string | null; }

async function loadOwner(slug: string, userId: string) {
  const row = await queryOne<OwnerCommunity>`
    SELECT id, created_by, stripe_account_id FROM communities WHERE slug = ${slug}
  `;
  if (!row) return { error: NextResponse.json({ error: 'Community not found' }, { status: 404 }) };
  if (row.created_by !== userId) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  if (!row.stripe_account_id) return { error: NextResponse.json({ error: 'Payments not set up' }, { status: 400 }) };
  return { row };
}

export async function PATCH(req: Request, props: { params: Promise<{ communitySlug: string; id: string }> }) {
  const { communitySlug, id } = await props.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await loadOwner(communitySlug, session.user.id);
  if ('error' in result) return result.error;
  try {
    const body = await req.json();
    await setPromoCodeActive({
      id, communityId: result.row.id, stripeAccountId: result.row.stripe_account_id!, active: Boolean(body.active),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update promo code';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, props: { params: Promise<{ communitySlug: string; id: string }> }) {
  const { communitySlug, id } = await props.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await loadOwner(communitySlug, session.user.id);
  if ('error' in result) return result.error;
  try {
    await deletePromoCode({ id, communityId: result.row.id, stripeAccountId: result.row.stripe_account_id! });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete promo code';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test __tests__/api/promo-codes/item-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/community/[communitySlug]/promo-codes/[id]/route.ts" __tests__/api/promo-codes/item-route.test.ts
git commit -m "feat(promo-codes): activate/deactivate + delete API route"
```

---

### Task 10: API route — public validate (`/promo-codes/validate`)

**Files:**
- Create: `app/api/community/[communitySlug]/promo-codes/validate/route.ts`
- Test: `__tests__/api/promo-codes/validate-route.test.ts`

**Interfaces:**
- Consumes: `validatePromoCode` (service); `queryOne`.
- Produces: `POST` (body `{ code: string }`) → `ValidateResult`. Public (no session), but requires the community to have a connected account. Note: the static `validate` segment sits beside the dynamic `[id]` segment; Next.js matches the static path first, so `/promo-codes/validate` never falls into `[id]`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/promo-codes/validate-route.test.ts`:

```ts
import { POST } from '@/app/api/community/[communitySlug]/promo-codes/validate/route';

const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({ queryOne: (...a: unknown[]) => mockQueryOne(...a), sql: jest.fn() }));
const mockValidate = jest.fn();
jest.mock('@/lib/promo-codes/service', () => ({ validatePromoCode: (...a: unknown[]) => mockValidate(...a) }));

const params = Promise.resolve({ communitySlug: 'salsa' });
beforeEach(() => { mockQueryOne.mockReset(); mockValidate.mockReset(); });

it('returns the validation result for a known community', async () => {
  mockQueryOne.mockResolvedValueOnce({ stripe_account_id: 'acct_1' });
  mockValidate.mockResolvedValueOnce({ valid: true, promotionCodeId: 'promo_1', preview: { label: '20% off for 3 months' } });
  const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'MARCELA20' }) }), { params });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ valid: true, promotionCodeId: 'promo_1' });
  expect(mockValidate).toHaveBeenCalledWith({ stripeAccountId: 'acct_1', code: 'MARCELA20' });
});

it('returns a generic invalid result when the community has no payments set up', async () => {
  mockQueryOne.mockResolvedValueOnce({ stripe_account_id: null });
  const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'X' }) }), { params });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ valid: false, reason: expect.any(String) });
  expect(mockValidate).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test __tests__/api/promo-codes/validate-route.test.ts`
Expected: FAIL — route module does not exist.

- [ ] **Step 3: Write the route**

Create `app/api/community/[communitySlug]/promo-codes/validate/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { validatePromoCode } from '@/lib/promo-codes/service';

export async function POST(req: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await props.params;
  const community = await queryOne<{ stripe_account_id: string | null }>`
    SELECT stripe_account_id FROM communities WHERE slug = ${communitySlug}
  `;
  // Generic invalid result (never leak whether a community/code exists).
  const invalid = NextResponse.json({ valid: false, reason: 'That code is not valid.' });
  if (!community?.stripe_account_id) return invalid;

  try {
    const body = await req.json();
    const code = typeof body?.code === 'string' ? body.code : '';
    if (!code.trim()) return invalid;
    const result = await validatePromoCode({ stripeAccountId: community.stripe_account_id, code });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[promo-codes] validate failed', err);
    return invalid;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test __tests__/api/promo-codes/validate-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/community/[communitySlug]/promo-codes/validate/route.ts" __tests__/api/promo-codes/validate-route.test.ts
git commit -m "feat(promo-codes): public validate API route"
```

---

### Task 11: Attach the discount in `join-paid` + handle the €0 first invoice

**Files:**
- Modify: `app/api/community/[communitySlug]/join-paid/route.ts`
- Modify: `app/api/webhooks/stripe/route.ts`
- Test: `__tests__/api/promo-codes/join-paid-discount.test.ts`

**Interfaces:**
- Consumes: request body now optionally includes `promotionCodeId?: string`.
- Produces: response is either the existing `{ clientSecret, stripeAccountId, subscriptionId }` (payment due) OR `{ requiresSetup: true, clientSecret, stripeAccountId, subscriptionId }` when the first invoice is fully discounted (€0). `clientSecret` is a SetupIntent secret in the `requiresSetup` case.

**Background:** `join-paid` creates the membership subscription on the connected account with `payment_behavior: 'default_incomplete'` and reads `latest_invoice.confirmation_secret.client_secret`. When a 100%-off code makes the first invoice €0, Stripe creates no PaymentIntent and there is no confirmation secret; we instead create a SetupIntent to capture a card for later full-price renewals, and a webhook sets it as the subscription default.

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/promo-codes/join-paid-discount.test.ts`:

```ts
import { POST } from '@/app/api/community/[communitySlug]/join-paid/route';

const mockCustomersCreate = jest.fn();
const mockSubscriptionsCreate = jest.fn();
const mockSubscriptionsCancel = jest.fn();
const mockSetupIntentsCreate = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    customers: { create: (...a: unknown[]) => mockCustomersCreate(...a) },
    subscriptions: { create: (...a: unknown[]) => mockSubscriptionsCreate(...a), cancel: (...a: unknown[]) => mockSubscriptionsCancel(...a) },
    setupIntents: { create: (...a: unknown[]) => mockSetupIntentsCreate(...a) },
  },
}));
const mockSql = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({ sql: (...a: unknown[]) => mockSql(...a), queryOne: (...a: unknown[]) => mockQueryOne(...a) }));

const params = Promise.resolve({ communitySlug: 'salsa' });
const community = {
  id: 'c1', membership_price: 20, stripe_account_id: 'acct_1', stripe_price_id: 'price_1',
  active_member_count: 5, created_at: '2020-01-01T00:00:00.000Z', promotional_fee_percentage: null,
};

beforeEach(() => {
  [mockCustomersCreate, mockSubscriptionsCreate, mockSubscriptionsCancel, mockSetupIntentsCreate, mockSql, mockQueryOne]
    .forEach((m) => m.mockReset());
});

function req(body: object) {
  return new Request('http://x', { method: 'POST', body: JSON.stringify(body) });
}

it('attaches the promotion code to the subscription when provided', async () => {
  mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce(null); // community, then no existing member
  mockCustomersCreate.mockResolvedValueOnce({ id: 'cus_1' });
  mockSubscriptionsCreate.mockResolvedValueOnce({
    id: 'sub_1',
    latest_invoice: { id: 'in_1', amount_due: 1600, confirmation_secret: { client_secret: 'pi_secret' } },
  });
  mockSql.mockResolvedValue([]);

  const res = await POST(req({ userId: 'u1', email: 'u1@x.com', promotionCodeId: 'promo_1' }), { params });

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ clientSecret: 'pi_secret', subscriptionId: 'sub_1' });
  expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
    expect.objectContaining({ discounts: [{ promotion_code: 'promo_1' }] }),
    { stripeAccount: 'acct_1' },
  );
});

it('returns requiresSetup with a SetupIntent secret when the first invoice is €0', async () => {
  mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce(null);
  mockCustomersCreate.mockResolvedValueOnce({ id: 'cus_1' });
  mockSubscriptionsCreate.mockResolvedValueOnce({
    id: 'sub_1',
    latest_invoice: { id: 'in_1', amount_due: 0, confirmation_secret: null },
  });
  mockSetupIntentsCreate.mockResolvedValueOnce({ client_secret: 'seti_secret' });
  mockSql.mockResolvedValue([]);

  const res = await POST(req({ userId: 'u1', email: 'u1@x.com', promotionCodeId: 'promo_free' }), { params });

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ requiresSetup: true, clientSecret: 'seti_secret', subscriptionId: 'sub_1' });
  expect(mockSetupIntentsCreate).toHaveBeenCalledWith(
    expect.objectContaining({ customer: 'cus_1', usage: 'off_session', metadata: expect.objectContaining({ subscription_id: 'sub_1' }) }),
    { stripeAccount: 'acct_1' },
  );
});

it('does not attach discounts when no promotion code is given', async () => {
  mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce(null);
  mockCustomersCreate.mockResolvedValueOnce({ id: 'cus_1' });
  mockSubscriptionsCreate.mockResolvedValueOnce({
    id: 'sub_1', latest_invoice: { id: 'in_1', amount_due: 2000, confirmation_secret: { client_secret: 'pi_secret' } },
  });
  mockSql.mockResolvedValue([]);

  await POST(req({ userId: 'u1', email: 'u1@x.com' }), { params });

  const createArg = mockSubscriptionsCreate.mock.calls[0][0] as Record<string, unknown>;
  expect(createArg.discounts).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test __tests__/api/promo-codes/join-paid-discount.test.ts`
Expected: FAIL (existing route neither reads `promotionCodeId` nor expands `latest_invoice.amount_due` / creates a SetupIntent). Some assertions fail.

- [ ] **Step 3: Modify `join-paid/route.ts`**

In `app/api/community/[communitySlug]/join-paid/route.ts`:

(a) Read the optional promotion code from the body — change the destructure near line 26:

```ts
    const { userId, email, promotionCodeId } = await request.json();
```

(b) Expand `latest_invoice` fields we need and attach discounts. Replace the `stripe.subscriptions.create(...)` call (lines ~131-151) with:

```ts
    const subscription = await stripe.subscriptions.create(
      {
        customer: customer.id,
        items: [{ price: community.stripe_price_id }],
        payment_behavior: 'default_incomplete',
        payment_settings: {
          payment_method_types: ['card'],
          save_default_payment_method: 'on_subscription',
        },
        metadata: {
          user_id: userId,
          community_id: community.id,
          platform_fee_percentage: feePercentage,
        },
        application_fee_percent: feePercentage,
        ...(promotionCodeId ? { discounts: [{ promotion_code: promotionCodeId }] } : {}),
        expand: ['latest_invoice.confirmation_secret'],
      },
      {
        stripeAccount: community.stripe_account_id!,
      }
    );
```

(c) Replace the confirmation-secret block (lines ~153-173) so a €0 first invoice takes the SetupIntent path. Replace from `const latestInvoice = ...` through `const clientSecret = confirmationSecret.client_secret;` with:

```ts
    const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null;
    const confirmationSecret = (latestInvoice as any)?.confirmation_secret;
    const amountDue = (latestInvoice as any)?.amount_due ?? null;

    // Normal path: there is a payment to confirm on the first invoice.
    let clientSecret: string | null = confirmationSecret?.client_secret ?? null;
    let requiresSetup = false;

    // Fully-discounted first invoice (e.g. a 100%-off code): Stripe creates no
    // PaymentIntent, so there is nothing to confirm. Collect a card via a
    // SetupIntent so renewals at full price can charge later. A webhook
    // (setup_intent.succeeded) sets it as the subscription's default method.
    if (!clientSecret && amountDue === 0) {
      const setupIntent = await stripe.setupIntents.create(
        {
          customer: customer.id,
          usage: 'off_session',
          payment_method_types: ['card'],
          metadata: {
            subscription_id: subscription.id,
            community_id: community.id,
            user_id: userId,
          },
        },
        { stripeAccount: community.stripe_account_id! }
      );
      clientSecret = setupIntent.client_secret;
      requiresSetup = true;
    }

    if (!clientSecret) {
      console.error('No confirmation secret or setup intent for subscription:', {
        subscriptionId: subscription.id,
        latestInvoiceId: latestInvoice?.id,
        amountDue,
      });
      await stripe.subscriptions.cancel(subscription.id, { stripeAccount: community.stripe_account_id! });
      return NextResponse.json({ error: 'Failed to initialize payment. Please try again.' }, { status: 500 });
    }
```

(d) Update the success response (lines ~219-223) to include `requiresSetup`:

```ts
    return NextResponse.json({
      clientSecret,
      requiresSetup,
      stripeAccountId: community.stripe_account_id,
      subscriptionId: subscription.id,
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test __tests__/api/promo-codes/join-paid-discount.test.ts`
Expected: PASS.

- [ ] **Step 5: Set the saved card as the subscription default in the webhook**

In `app/api/webhooks/stripe/route.ts`, add a handler for `setup_intent.succeeded`. Inside the main `switch`/`if` that dispatches on `event.type`, add:

```ts
      case 'setup_intent.succeeded': {
        const si = event.data.object as Stripe.SetupIntent;
        const subscriptionId = si.metadata?.subscription_id;
        const connectedAccountId = event.account; // present on Connect (direct-charge) events
        if (subscriptionId && si.payment_method && connectedAccountId) {
          try {
            await stripe.subscriptions.update(
              subscriptionId,
              { default_payment_method: si.payment_method as string },
              { stripeAccount: connectedAccountId }
            );
          } catch (err) {
            console.error('[webhook] failed to set default payment method from setup intent', err);
          }
        }
        break;
      }
```

Note for the implementer: match the file's existing dispatch style. If it uses `if (event.type === ...)` blocks rather than a `switch`, add an equivalent `if (event.type === 'setup_intent.succeeded') { ... }` block. Confirm `Stripe` is imported in the file (it is used elsewhere).

- [ ] **Step 6: Verify the whole suite still passes and commit**

Run: `bun run test __tests__/api/promo-codes/ __tests__/lib/promo-codes/`
Expected: PASS.

```bash
git add "app/api/community/[communitySlug]/join-paid/route.ts" "app/api/webhooks/stripe/route.ts" __tests__/api/promo-codes/join-paid-discount.test.ts
git commit -m "feat(promo-codes): apply discount in join-paid and handle free first invoice"
```

---

### Task 12: Owner admin UI — Promo codes page + manager + nav link

**Files:**
- Create: `app/[communitySlug]/admin/(with-nav)/promo-codes/page.tsx`
- Create: `components/admin/PromoCodesManager.tsx`
- Modify: `components/admin/AdminNav.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/community/[slug]/promo-codes`, `PATCH/DELETE /api/community/[slug]/promo-codes/[id]`; `PromoCodeWithUsage`, `CreatePromoCodeInput` from `@/lib/promo-codes/types`; `buildPreview`/`formatDiscountLabel`/`formatDurationLabel` from `@/lib/promo-codes/format`.
- Produces: an admin section at `/[communitySlug]/admin/promo-codes`.

- [ ] **Step 1: Add the nav link**

In `components/admin/AdminNav.tsx`, add an item to the `items` array after the `subscriptions` entry (line 18):

```ts
    { href: `/${communitySlug}/admin/promo-codes`,       label: 'Promo Codes',       exact: false },
```

- [ ] **Step 2: Create the server page**

Create `app/[communitySlug]/admin/(with-nav)/promo-codes/page.tsx`:

```tsx
import { queryOne } from '@/lib/db';
import { PromoCodesManager } from '@/components/admin/PromoCodesManager';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

interface Row {
  id: string;
  membership_enabled: boolean | null;
  membership_price: number | null;
  stripe_account_id: string | null;
  stripe_price_id: string | null;
}

export default async function PromoCodesPage(props: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await props.params;
  const community = await queryOne<Row>`
    SELECT id, membership_enabled, membership_price, stripe_account_id, stripe_price_id
    FROM communities WHERE slug = ${communitySlug}
  `;
  if (!community) return null;

  const ready = Boolean(community.stripe_account_id && community.stripe_price_id && community.membership_enabled);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500">
      <header className="mb-10">
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">Promo Codes</h1>
        <p className="mt-2 text-muted-foreground">
          Create codes that give new members a discount when they join.
        </p>
      </header>

      {ready ? (
        <PromoCodesManager communitySlug={communitySlug} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Set up payments and a membership price before creating promo codes.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the manager client component**

Create `components/admin/PromoCodesManager.tsx`. It fetches the list, renders it, and offers a create form plus pause/resume and delete actions. Follow existing UI primitives (`@/components/ui/button`, `react-hot-toast`).

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import type { PromoCodeWithUsage, CreatePromoCodeInput } from '@/lib/promo-codes/types';
import { formatDiscountLabel, formatDurationLabel } from '@/lib/promo-codes/format';

const EMPTY: CreatePromoCodeInput = {
  code: '', discountType: 'percent', discountValue: 20,
  duration: 'once', durationInMonths: 3, maxRedemptions: null, expiresAt: null,
};

export function PromoCodesManager({ communitySlug }: { communitySlug: string }) {
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
```

Note for the implementer: the list currency is hardcoded to `'eur'` for display only. If communities can use other currencies, thread the community currency into the page props and pass it down. Verify the `Button` variants (`outline`, `ghost`, `size="sm"`) exist in `@/components/ui/button` and adjust to available variants if not.

- [ ] **Step 4: Manual verification**

1. Start the app in a worktree (never build in the main repo): `bun dev`.
2. As a community owner with payments set up and a membership price, open `/<yourCommunity>/admin/promo-codes`.
3. Create a percentage code (e.g. `TEST20`, 20%, first payment). Confirm it appears in the list with "20% off, first payment, 0 used".
4. In the Stripe dashboard for the connected account, confirm a Coupon and a Promotion Code named `TEST20` exist.
5. Pause the code, confirm it shows "paused" and the Stripe promotion code shows inactive; resume it.
6. Delete the code, confirm it leaves the list and the Stripe promotion code is inactive.

- [ ] **Step 5: Commit**

```bash
git add components/admin/AdminNav.tsx components/admin/PromoCodesManager.tsx "app/[communitySlug]/admin/(with-nav)/promo-codes/page.tsx"
git commit -m "feat(promo-codes): owner admin UI to create and manage codes"
```

---

### Task 13: Join screen — promo entry + free-code SetupIntent path

**Files:**
- Create: `components/JoinPromoModal.tsx`
- Modify: `app/[communitySlug]/FeedClient.tsx`
- Modify: `components/PaymentModal.tsx`

**Interfaces:**
- Consumes: `POST /api/community/[slug]/promo-codes/validate` → `ValidateResult`; the modified `join-paid` response `{ clientSecret, requiresSetup, stripeAccountId, subscriptionId }`.
- Produces: a promo entry step before payment, and a PaymentModal that confirms either a payment or a setup (free first invoice).

- [ ] **Step 1: Add a setup mode to `PaymentModal`**

In `components/PaymentModal.tsx`:

(a) Add `mode` to both prop interfaces and thread it through:

```ts
// PaymentFormProps
  mode?: 'payment' | 'setup';
// PaymentModalProps
  mode?: 'payment' | 'setup';
```

(b) In `PaymentModal`, pass `mode` to `PaymentForm` (default `'payment'`), and forward it in the JSX:

```tsx
export default function PaymentModal({
  isOpen, onClose, clientSecret, stripeAccountId, communitySlug, price, onSuccess, mode = 'payment',
}: PaymentModalProps) {
  // ...unchanged...
        <Elements stripe={stripePromise} options={options}>
          <PaymentForm
            clientSecret={clientSecret}
            communitySlug={communitySlug}
            price={price}
            mode={mode}
            onSuccess={onSuccess}
            onClose={onClose}
          />
        </Elements>
  // ...
}
```

(c) In `PaymentForm.handleSubmit`, branch on `mode` so a free first invoice confirms the SetupIntent instead of a payment:

```ts
      const { error } =
        mode === 'setup'
          ? await stripe.confirmSetup({
              elements,
              confirmParams: { return_url: `${window.location.origin}/${communitySlug}?success=true` },
              redirect: 'if_required',
            })
          : await stripe.confirmPayment({
              elements,
              confirmParams: { return_url: `${window.location.origin}/${communitySlug}?success=true` },
              redirect: 'if_required',
            });
```

(d) Update the submit button label so it does not promise a charge in setup mode:

```tsx
        ) : (
          mode === 'setup' ? 'Save card and join' : `Pay €${price}/month`
        )}
```

Note: `redirect: 'if_required'` is required here per the project's Stripe modal convention (polling + onSuccess). Keep it on both branches.

- [ ] **Step 2: Create `JoinPromoModal`**

Create `components/JoinPromoModal.tsx`. It shows the price, an optional promo field with an Apply action that calls the validate endpoint and shows the preview, and a Continue button that hands the resolved `promotionCodeId` (or null) back to the caller.

```tsx
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
```

- [ ] **Step 3: Wire it into `FeedClient`**

In `app/[communitySlug]/FeedClient.tsx`:

(a) Import the modal near the other imports (after line 9):

```tsx
import { JoinPromoModal } from "@/components/JoinPromoModal";
```

(b) Add state near the other payment state (around line 171):

```tsx
  const [showJoinPromoModal, setShowJoinPromoModal] = useState(false);
  const [isPreparingJoin, setIsPreparingJoin] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'payment' | 'setup'>('payment');
```

(c) In `handleJoinCommunity`, the paid-membership branch should open the promo modal instead of calling `join-paid` directly. Replace the body of the `else if ( community?.membershipEnabled && ... )` branch (the fetch to `join-paid` and the state it sets, lines ~340-365) with:

```tsx
        // Handle paid membership: collect an optional promo code first.
        setShowJoinPromoModal(true);
```

(d) Add a handler that runs when the member continues from the promo modal (place it next to `handleJoinCommunity`):

```tsx
  const handleContinuePaidJoin = async (promotionCodeId: string | null) => {
    if (!currentUser) return;
    setIsPreparingJoin(true);
    try {
      const response = await fetch(`/api/community/${communitySlug}/join-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id, email: currentUser.email, promotionCodeId }),
      });
      if (!response.ok) throw new Error("Failed to create payment");
      const { clientSecret, requiresSetup, stripeAccountId } = await response.json();
      setPaymentClientSecret(clientSecret);
      setStripeAccountId(stripeAccountId);
      setPaymentMode(requiresSetup ? 'setup' : 'payment');
      setShowJoinPromoModal(false);
      setShowPaymentModal(true);
    } catch (err) {
      console.error(err);
      toast.error("Failed to start checkout");
    } finally {
      setIsPreparingJoin(false);
    }
  };
```

(e) Pass `mode={paymentMode}` to the existing `<PaymentModal ... />` (around line 818) and render the promo modal next to it:

```tsx
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        clientSecret={paymentClientSecret}
        stripeAccountId={stripeAccountId}
        communitySlug={communitySlug}
        price={community.membershipPrice ?? 0}
        mode={paymentMode}
        onSuccess={() => { setShowPaymentModal(false); /* keep existing onSuccess side effects */ }}
      />

      <JoinPromoModal
        isOpen={showJoinPromoModal}
        onClose={() => setShowJoinPromoModal(false)}
        communitySlug={communitySlug}
        price={community.membershipPrice ?? 0}
        onContinue={handleContinuePaidJoin}
        isContinuing={isPreparingJoin}
      />
```

Note for the implementer: keep whatever side effects the existing `PaymentModal` `onSuccess` already performs (member refresh, toast, etc.); only add the `mode` prop and the promo modal. Confirm `toast` is already imported in `FeedClient` (it is used elsewhere in the file); if not, import from `react-hot-toast`.

- [ ] **Step 4: Manual verification**

Run the app in a worktree (`bun dev`), signed in as a non-member on a paid community that has a promo code:

1. Click Join. The promo modal appears showing the monthly price.
2. Enter a valid percentage code, click Apply. The preview shows (e.g. "20% off for 3 months"). Click Continue. The payment modal opens showing the normal card form; the amount reflects the discount.
3. Complete payment with a Stripe test card. Membership activates.
4. Repeat with a 100%-off first-payment code: after Continue, the payment modal shows "Save card and join" (setup mode). Enter a test card. Membership activates with no charge, and the saved card appears on the subscription in the Stripe dashboard (default payment method set by the webhook).
5. Enter a bogus code, click Apply. An inline "not valid" message shows; Continue still works with no discount.

- [ ] **Step 5: Full test run and commit**

Run: `bun run test`
Expected: PASS (whole suite).

```bash
git add components/JoinPromoModal.tsx components/PaymentModal.tsx "app/[communitySlug]/FeedClient.tsx"
git commit -m "feat(promo-codes): promo entry on join screen with free-code setup path"
```

---

## Final verification

- [ ] Run the full suite: `bun run test` → all green.
- [ ] Lint: `bun lint` → no new errors in touched files.
- [ ] Manual end-to-end (in a worktree, per project rule — never build in the main repo): owner creates a repeating percentage code, a member joins with it and is charged the discounted amount, the platform application fee is proportionally lower on the invoice, and the redemption count increments in the owner list. Then a 100%-off code joins with no charge and a saved card.
- [ ] Deploy per project convention (`./deploy.sh code` for prod, `deploy-preprod.sh` for preprod) only when asked.
```
