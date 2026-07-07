# Yearly Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the community join CTA plan-aware (no misleading monthly-only price when a yearly plan exists), and let owners scope a promo code to the monthly plan, the yearly plan, or both.

**Architecture:** Two independent changes. (1) A pure label helper (`getJoinButtonLabel`) gains the yearly fields it already has access to via `communityData`. (2) A new `applies_to_plan` column on `community_promo_codes` (default `'both'`) is set at creation by the owner UI and enforced at validation time in our own code — Stripe cannot restrict a coupon per-plan because monthly and yearly share one Stripe product.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Neon-shaped `sql`/`queryOne` over local Postgres, Stripe Connect (coupons + promotion codes), Jest + React Testing Library.

## Global Constraints

- Test runner is `bun run test` (Jest). NEVER `bun test`.
- All build/test/deploy commands run in this worktree (`/home/debian/apps/dance-hub-followups`), NEVER in the prod-serving main repo `/home/debian/apps/dance-hub`.
- No em dashes in user-facing copy — use periods/commas.
- No vendor brand names (Stripe, LiveKit, etc.) in user-facing strings.
- Monthly and yearly membership reuse ONE Stripe product (two Prices); per-plan promo scope is enforced in-app, not by Stripe.
- `applies_to_plan` defaults to `'both'`; existing promo codes must be unaffected.
- Commit after each task. Typecheck touched files with `npx tsc --noEmit` before committing.

## Prerequisites (one-time worktree bootstrap)

This branch runs in a fresh git worktree (`/home/debian/apps/dance-hub-followups`) that shares `.git` with the main repo but has its own working tree with **no `node_modules`**. Before running any test or typecheck:

- [ ] **Install dependencies in the worktree**

Run: `cd /home/debian/apps/dance-hub-followups && bun install`
Expected: dependencies installed (a `node_modules/` appears in the worktree). Re-run only if it fails.

---

### Task 1: Plan-aware join CTA label

**Files:**
- Modify: `lib/page-builder.ts` (interface `JoinButtonLabelData`, function `getJoinButtonLabel`)
- Test: `__tests__/lib/page-builder.test.ts` (create)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `getJoinButtonLabel(data?: JoinButtonLabelData, opts?: { isEditing?: boolean }): string`. `JoinButtonLabelData` now includes `yearlyEnabled?: boolean` and `yearlyPrice?: number`. Callers (`HeroSection`, `CTASection`) already pass `communityData` which carries these fields — no call-site change required.

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/page-builder.test.ts`:

```ts
import { getJoinButtonLabel } from '@/lib/page-builder';

describe('getJoinButtonLabel', () => {
  it('shows the monthly price when only monthly is configured', () => {
    expect(getJoinButtonLabel({ membershipEnabled: true, membershipPrice: 20 }))
      .toBe('Join for €20/month');
  });

  it('shows a generic label when a yearly plan is enabled', () => {
    expect(getJoinButtonLabel({
      membershipEnabled: true, membershipPrice: 20,
      yearlyEnabled: true, yearlyPrice: 200,
    })).toBe('Join community');
  });

  it('ignores yearly when its price is 0 or missing', () => {
    expect(getJoinButtonLabel({
      membershipEnabled: true, membershipPrice: 20, yearlyEnabled: true, yearlyPrice: 0,
    })).toBe('Join for €20/month');
  });

  it('shows free join when membership is not paid', () => {
    expect(getJoinButtonLabel({ membershipEnabled: false })).toBe('Join for free');
  });

  it('keeps the monthly framing for pre-registration even with yearly enabled', () => {
    expect(getJoinButtonLabel({
      status: 'pre_registration', membershipEnabled: true, membershipPrice: 20,
      yearlyEnabled: true, yearlyPrice: 200,
    })).toBe('Pre-Register for €20/month');
  });

  it('returns the member label when already a member (not editing)', () => {
    expect(getJoinButtonLabel({ isMember: true }, { isEditing: false }))
      .toBe("You're already a member");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- page-builder`
Expected: FAIL — the "generic label when a yearly plan is enabled" case returns `Join for €20/month` instead of `Join community` (and `JoinButtonLabelData` has no yearly fields).

- [ ] **Step 3: Implement**

In `lib/page-builder.ts`, replace the `JoinButtonLabelData` interface and `getJoinButtonLabel` function with:

```ts
interface JoinButtonLabelData {
  isMember?: boolean;
  status?: 'active' | 'pre_registration' | 'inactive';
  membershipEnabled?: boolean;
  membershipPrice?: number;
  yearlyEnabled?: boolean;
  yearlyPrice?: number;
}

export function getJoinButtonLabel(
  data: JoinButtonLabelData | undefined,
  { isEditing }: { isEditing?: boolean } = {}
): string {
  if (data?.isMember && !isEditing) return "You're already a member";
  if (data?.status === 'inactive') return 'Community Inactive';

  const price = data?.membershipPrice;
  const isPaid = Boolean(data?.membershipEnabled && price && price > 0);
  const hasYearly = Boolean(data?.yearlyEnabled && (data?.yearlyPrice ?? 0) > 0);

  if (data?.status === 'pre_registration') {
    return isPaid ? `Pre-Register for €${price}/month` : 'Pre-Register for free';
  }
  if (isPaid && hasYearly) return 'Join community';
  return isPaid ? `Join for €${price}/month` : 'Join for free';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- page-builder`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -iE "page-builder|HeroSection|CTASection" || echo "clean"`
Expected: `clean` (Hero/CTA sections already pass `communityData`, which is a superset of `JoinButtonLabelData`).

- [ ] **Step 6: Commit**

```bash
git add lib/page-builder.ts __tests__/lib/page-builder.test.ts
git commit -m "feat(cta): plan-aware join label (generic 'Join community' when yearly enabled)"
```

---

### Task 2: Promo scope — data model + persist on create

**Files:**
- Create: `supabase/migrations/2026-07-07_promo_applies_to_plan.sql`
- Modify: `lib/promo-codes/types.ts` (`AppliesToPlan`, `CreatePromoCodeInput`, `PromoCodeRecord`)
- Modify: `lib/promo-codes/service.ts` (`PromoCodeRow`, `rowToRecord`, `createPromoCode` INSERT)
- Modify: `lib/promo-codes/coupon-params.ts` (`validateCreateInput` guards the scope value)
- Test: `__tests__/lib/promo-codes/coupon-params.test.ts` (add scope validation), `__tests__/lib/promo-codes/service-create.test.ts` (record carries scope; INSERT receives it)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `type AppliesToPlan = 'monthly' | 'yearly' | 'both'`
  - `CreatePromoCodeInput.appliesToPlan?: AppliesToPlan` (optional, defaults to `'both'`)
  - `PromoCodeRecord.appliesToPlan: AppliesToPlan` (always set)
  - `PromoCodeRow.applies_to_plan: AppliesToPlan`
  - `rowToRecord(row)` maps `appliesToPlan: (row.applies_to_plan ?? 'both')`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/2026-07-07_promo_applies_to_plan.sql`:

```sql
-- Per-plan scope for community promo codes. Monthly and yearly membership share
-- one Stripe product, so this scope is enforced in-app (at validation), not by
-- Stripe. Existing codes default to 'both' so nothing changes for them.
ALTER TABLE community_promo_codes
  ADD COLUMN IF NOT EXISTS applies_to_plan TEXT NOT NULL DEFAULT 'both';
```

- [ ] **Step 2: Write the failing tests**

In `__tests__/lib/promo-codes/coupon-params.test.ts`, add inside the `describe('validateCreateInput', ...)` block:

```ts
  it('accepts a valid plan scope', () => {
    expect(validateCreateInput({ ...base, appliesToPlan: 'yearly' })).toBeNull();
  });
  it('rejects an invalid plan scope', () => {
    expect(validateCreateInput({ ...base, appliesToPlan: 'weekly' as unknown as 'both' }))
      .toMatch(/plan/i);
  });
```

In `__tests__/lib/promo-codes/service-create.test.ts`, add two tests (after the existing ones):

```ts
it('persists the plan scope and reflects it on the record', async () => {
  mockCouponsCreate.mockResolvedValueOnce({ id: 'coupon_3' });
  mockPromoCreate.mockResolvedValueOnce({ id: 'promo_3' });
  mockQueryOne.mockResolvedValueOnce({
    id: 'row_3', community_id: 'c1', code: 'YEARONLY',
    stripe_coupon_id: 'coupon_3', stripe_promotion_code_id: 'promo_3',
    discount_type: 'percent', discount_value: 20, duration: 'once',
    duration_in_months: null, max_redemptions: null, expires_at: null,
    active: true, created_by: 'user_1', created_at: '2026-07-07T00:00:00.000Z',
    applies_to_plan: 'yearly',
  });

  const rec = await createPromoCode({
    ...args,
    input: { ...args.input, duration: 'once', durationInMonths: null, appliesToPlan: 'yearly' },
  });

  expect(rec.appliesToPlan).toBe('yearly');
  // the scope value is passed into the INSERT tagged-template call
  expect(mockQueryOne.mock.calls[0]).toContain('yearly');
});

it('defaults appliesToPlan to both when the row has none', async () => {
  mockCouponsCreate.mockResolvedValueOnce({ id: 'coupon_4' });
  mockPromoCreate.mockResolvedValueOnce({ id: 'promo_4' });
  mockQueryOne.mockResolvedValueOnce({
    id: 'row_4', community_id: 'c1', code: 'PLAIN',
    stripe_coupon_id: 'coupon_4', stripe_promotion_code_id: 'promo_4',
    discount_type: 'percent', discount_value: 20, duration: 'once',
    duration_in_months: null, max_redemptions: null, expires_at: null,
    active: true, created_by: 'user_1', created_at: '2026-07-07T00:00:00.000Z',
  });

  const rec = await createPromoCode({
    ...args,
    input: { ...args.input, duration: 'once', durationInMonths: null },
  });

  expect(rec.appliesToPlan).toBe('both');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun run test -- promo-codes/coupon-params promo-codes/service-create`
Expected: FAIL — `appliesToPlan` is not a known property; `rec.appliesToPlan` is `undefined`; the INSERT does not include the scope value.

- [ ] **Step 4: Update types**

In `lib/promo-codes/types.ts`:
- Add near the top: `export type AppliesToPlan = 'monthly' | 'yearly' | 'both';`
- In `CreatePromoCodeInput`, add: `appliesToPlan?: AppliesToPlan; // which plan(s) the code applies to; defaults to 'both'`
- In `PromoCodeRecord`, add: `appliesToPlan: AppliesToPlan;`

- [ ] **Step 5: Update the service (row type, mapping, INSERT)**

In `lib/promo-codes/service.ts`:
- Import the type: change the type import to include `AppliesToPlan` from `./types`.
- In `PromoCodeRow`, add: `applies_to_plan: AppliesToPlan;`
- In `rowToRecord`, add to the returned object: `appliesToPlan: (row.applies_to_plan ?? 'both') as AppliesToPlan,`
- In `createPromoCode`, change the INSERT to include the new column. Replace the column list and VALUES so they read:

```ts
  const row = await queryOne<PromoCodeRow>`
    INSERT INTO community_promo_codes (
      community_id, code, stripe_coupon_id, stripe_promotion_code_id,
      discount_type, discount_value, duration, duration_in_months,
      max_redemptions, expires_at, active, created_by, applies_to_plan
    ) VALUES (
      ${args.communityId}, ${args.input.code.trim()}, ${coupon.id}, ${promo.id},
      ${args.input.discountType}, ${args.input.discountValue}, ${args.input.duration},
      ${args.input.durationInMonths}, ${args.input.maxRedemptions},
      ${args.input.expiresAt}, true, ${args.createdBy}, ${args.input.appliesToPlan ?? 'both'}
    )
    RETURNING *
  `;
```

- [ ] **Step 6: Guard the scope value in validateCreateInput**

In `lib/promo-codes/coupon-params.ts`, inside `validateCreateInput`, add before `return null;`:

```ts
  if (input.appliesToPlan != null &&
      !['monthly', 'yearly', 'both'].includes(input.appliesToPlan)) {
    return 'Invalid plan scope';
  }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `bun run test -- promo-codes/coupon-params promo-codes/service-create promo-codes/service-list`
Expected: PASS (existing tests still green — they use `toMatchObject`/partial assertions, so the extra `appliesToPlan` field is harmless).

- [ ] **Step 8: Apply the migration to the preprod DB**

Run:
```bash
PGURL=$(grep -E '^DATABASE_URL=' /home/debian/apps/dance-hub-preprod/.env.local | cut -d= -f2- | tr -d '"')
psql "$PGURL" -v ON_ERROR_STOP=1 -f supabase/migrations/2026-07-07_promo_applies_to_plan.sql
psql "$PGURL" -tAc "SELECT column_name FROM information_schema.columns WHERE table_name='community_promo_codes' AND column_name='applies_to_plan';"
```
Expected: `ALTER TABLE`, then `applies_to_plan`.

- [ ] **Step 9: Typecheck + commit**

Run: `npx tsc --noEmit 2>&1 | grep -iE "promo-codes" || echo "clean"` (expect `clean`).

```bash
git add lib/promo-codes/types.ts lib/promo-codes/service.ts lib/promo-codes/coupon-params.ts \
  supabase/migrations/2026-07-07_promo_applies_to_plan.sql \
  __tests__/lib/promo-codes/coupon-params.test.ts __tests__/lib/promo-codes/service-create.test.ts
git commit -m "feat(promo): add applies_to_plan scope column, persist on create"
```

---

### Task 3: Promo scope — enforce at validation

**Files:**
- Modify: `lib/promo-codes/service.ts` (`validatePromoCode` signature + scope gate)
- Modify: `app/api/community/[communitySlug]/promo-codes/validate/route.ts` (load community id, pass `communityId` + `plan`)
- Modify: `components/PaymentModal.tsx` (`PaymentModalBody.applyPromo` sends `plan` in the validate body)
- Test: `__tests__/lib/promo-codes/service-validate.test.ts` (scope match/mismatch/missing-row), `__tests__/api/promo-codes/validate-route.test.ts` (route passes `communityId` + `plan`)

**Interfaces:**
- Consumes: `AppliesToPlan` and the `applies_to_plan` column from Task 2.
- Produces: `validatePromoCode({ stripeAccountId, code, communityId?, plan? })` — new optional `communityId` and `plan?: 'monthly' | 'yearly'`. When `communityId` is provided, it loads the mirror row and rejects a plan mismatch. When omitted, behavior is unchanged (existing callers unaffected).

- [ ] **Step 1: Write the failing service tests**

In `__tests__/lib/promo-codes/service-validate.test.ts`:

First, add a controllable `queryOne` mock handle. Replace the existing db mock line
`jest.mock('@/lib/db', () => ({ sql: jest.fn(), queryOne: jest.fn() }));`
with:

```ts
import { queryOne } from '@/lib/db';
jest.mock('@/lib/db', () => ({ sql: jest.fn(), queryOne: jest.fn() }));
const mockQueryOne = queryOne as jest.Mock;
```

And extend `beforeEach` to reset it:
`beforeEach(() => { mockPromoList.mockReset(); mockCouponRetrieve.mockReset(); mockQueryOne.mockReset(); });`

Then add these tests:

```ts
const activePromo = {
  id: 'promo_1', active: true, expires_at: null, max_redemptions: null,
  times_redeemed: 0, promotion: { type: 'coupon', coupon: 'co_1' },
};
const validCoupon = {
  valid: true, percent_off: 20, amount_off: null, currency: null,
  duration: 'once', duration_in_months: null,
};

it('accepts a code whose scope matches the chosen plan', async () => {
  mockPromoList.mockResolvedValueOnce({ data: [activePromo] });
  mockQueryOne.mockResolvedValueOnce({ applies_to_plan: 'yearly' });
  mockCouponRetrieve.mockResolvedValueOnce(validCoupon);
  const res = await validatePromoCode({
    stripeAccountId: 'acct_1', code: 'yr', communityId: 'c1', plan: 'yearly',
  });
  expect(res.valid).toBe(true);
});

it('accepts a both-scoped code for either plan', async () => {
  mockPromoList.mockResolvedValueOnce({ data: [activePromo] });
  mockQueryOne.mockResolvedValueOnce({ applies_to_plan: 'both' });
  mockCouponRetrieve.mockResolvedValueOnce(validCoupon);
  const res = await validatePromoCode({
    stripeAccountId: 'acct_1', code: 'any', communityId: 'c1', plan: 'monthly',
  });
  expect(res.valid).toBe(true);
});

it('rejects a code scoped to a different plan, without fetching the coupon', async () => {
  mockPromoList.mockResolvedValueOnce({ data: [activePromo] });
  mockQueryOne.mockResolvedValueOnce({ applies_to_plan: 'yearly' });
  const res = await validatePromoCode({
    stripeAccountId: 'acct_1', code: 'yr', communityId: 'c1', plan: 'monthly',
  });
  expect(res).toEqual({ valid: false, reason: 'This code only applies to the yearly plan.' });
  expect(mockCouponRetrieve).not.toHaveBeenCalled();
});

it('treats a missing mirror row as unrestricted', async () => {
  mockPromoList.mockResolvedValueOnce({ data: [activePromo] });
  mockQueryOne.mockResolvedValueOnce(null);
  mockCouponRetrieve.mockResolvedValueOnce(validCoupon);
  const res = await validatePromoCode({
    stripeAccountId: 'acct_1', code: 'x', communityId: 'c1', plan: 'monthly',
  });
  expect(res.valid).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- promo-codes/service-validate`
Expected: FAIL — the mismatch test still returns `valid: true` (no scope gate yet); `validatePromoCode` does not accept `communityId`/`plan`.

- [ ] **Step 3: Implement the scope gate**

In `lib/promo-codes/service.ts`, change the `validatePromoCode` signature and insert the gate. The function currently starts:

```ts
export async function validatePromoCode(args: {
  stripeAccountId: string;
  code: string;
}): Promise<ValidateResult> {
```

Change it to:

```ts
export async function validatePromoCode(args: {
  stripeAccountId: string;
  code: string;
  communityId?: string;
  plan?: 'monthly' | 'yearly';
}): Promise<ValidateResult> {
```

Then, immediately AFTER the existing redemption/expiry checks
(`if (promo.max_redemptions != null && ...) return invalid;`) and BEFORE the
`const couponId = ...` line, insert:

```ts
  // Per-plan scope (enforced in-app; monthly & yearly share one Stripe product).
  // A missing mirror row is treated as unrestricted ('both').
  if (args.communityId) {
    const plan = args.plan ?? 'monthly';
    const mirror = await queryOne<{ applies_to_plan: string }>`
      SELECT applies_to_plan FROM community_promo_codes
      WHERE community_id = ${args.communityId} AND lower(code) = lower(${trimmed})
      LIMIT 1
    `;
    const scope = mirror?.applies_to_plan ?? 'both';
    if (scope !== 'both' && scope !== plan) {
      return {
        valid: false,
        reason: scope === 'yearly'
          ? 'This code only applies to the yearly plan.'
          : 'This code only applies to the monthly plan.',
      };
    }
  }
```

(`queryOne` is already imported at the top of the file; `trimmed` is already defined earlier in the function.)

- [ ] **Step 4: Run service tests to verify they pass**

Run: `bun run test -- promo-codes/service-validate`
Expected: PASS (new + existing tests; the existing tests pass no `communityId`, so the gate is skipped and `queryOne` is never called for them).

- [ ] **Step 5: Update the validate route to pass communityId + plan**

In `app/api/community/[communitySlug]/promo-codes/validate/route.ts`:
- Change the community query to also select `id`:

```ts
  const community = await queryOne<{ id: string; stripe_account_id: string | null }>`
    SELECT id, stripe_account_id FROM communities WHERE slug = ${communitySlug}
  `;
```

- Replace the body/validate section with:

```ts
    const body = await req.json();
    const code = typeof body?.code === 'string' ? body.code : '';
    if (!code.trim()) return invalid;
    const plan = body?.plan === 'yearly' ? 'yearly' : 'monthly';
    const result = await validatePromoCode({
      stripeAccountId: community.stripe_account_id,
      code,
      communityId: community.id,
      plan,
    });
    return NextResponse.json(result);
```

- [ ] **Step 6: Update the validate-route test**

In `__tests__/api/promo-codes/validate-route.test.ts`, update the first test so the mocked row has an `id` and the service is called with the new args:

```ts
it('returns the validation result for a known community', async () => {
  mockQueryOne.mockResolvedValueOnce({ id: 'c1', stripe_account_id: 'acct_1' });
  mockValidate.mockResolvedValueOnce({ valid: true, promotionCodeId: 'promo_1', preview: { label: '20% off for 3 months' } });
  const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'MARCELA20', plan: 'yearly' }) }), { params });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ valid: true, promotionCodeId: 'promo_1' });
  expect(mockValidate).toHaveBeenCalledWith({ stripeAccountId: 'acct_1', code: 'MARCELA20', communityId: 'c1', plan: 'yearly' });
});

it('defaults the plan to monthly when the body omits it', async () => {
  mockQueryOne.mockResolvedValueOnce({ id: 'c1', stripe_account_id: 'acct_1' });
  mockValidate.mockResolvedValueOnce({ valid: true, promotionCodeId: 'promo_1', preview: { label: 'x' } });
  await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ code: 'X' }) }), { params });
  expect(mockValidate).toHaveBeenCalledWith({ stripeAccountId: 'acct_1', code: 'X', communityId: 'c1', plan: 'monthly' });
});
```

- [ ] **Step 7: Send the plan from the checkout**

In `components/PaymentModal.tsx`, inside `PaymentModalBody`'s `applyPromo`, the validate fetch currently sends `body: JSON.stringify({ code: rawCode })`. Change it to include the plan:

```ts
        body: JSON.stringify({ code: rawCode, plan }),
```

(`plan` is already a prop of `PaymentModalBody`.)

- [ ] **Step 8: Run tests + typecheck**

Run: `bun run test -- promo-codes`
Expected: PASS (all promo-code suites).
Run: `npx tsc --noEmit 2>&1 | grep -iE "promo-codes|PaymentModal|validate" || echo "clean"`
Expected: `clean`.

- [ ] **Step 9: Commit**

```bash
git add lib/promo-codes/service.ts \
  app/api/community/[communitySlug]/promo-codes/validate/route.ts \
  components/PaymentModal.tsx \
  __tests__/lib/promo-codes/service-validate.test.ts \
  __tests__/api/promo-codes/validate-route.test.ts
git commit -m "feat(promo): enforce per-plan scope at validation"
```

---

### Task 4: Owner UI — scope selector + list badge

**Files:**
- Modify: `components/admin/PromoCodesManager.tsx` (add `yearlyEnabled` prop, scope selector, `EMPTY` default, list badge)
- Modify: `app/[communitySlug]/admin/(with-nav)/promo-codes/page.tsx` (select `yearly_enabled`, pass prop)
- Test: `__tests__/components/PromoCodesManager.test.tsx` (create)

**Interfaces:**
- Consumes: `AppliesToPlan` and `CreatePromoCodeInput.appliesToPlan` from Task 2; `PromoCodeWithUsage.appliesToPlan` (inherited from `PromoCodeRecord`).
- Produces: `PromoCodesManager({ communitySlug, yearlyEnabled }: { communitySlug: string; yearlyEnabled: boolean })`.

- [ ] **Step 1: Write the failing component test**

Create `__tests__/components/PromoCodesManager.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { PromoCodesManager } from '@/components/admin/PromoCodesManager';

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true, json: async () => ({ codes: [] }),
  }) as unknown as typeof fetch;
});

it('shows the plan scope selector when yearly is enabled', async () => {
  render(<PromoCodesManager communitySlug="salsa" yearlyEnabled />);
  expect(await screen.findByText(/which plan can use this code/i)).toBeInTheDocument();
});

it('hides the plan scope selector when yearly is disabled', async () => {
  render(<PromoCodesManager communitySlug="salsa" yearlyEnabled={false} />);
  expect(await screen.findByText(/your codes/i)).toBeInTheDocument();
  expect(screen.queryByText(/which plan can use this code/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- PromoCodesManager`
Expected: FAIL — `PromoCodesManager` does not accept `yearlyEnabled`; no scope selector text exists.

- [ ] **Step 3: Update the manager component**

In `components/admin/PromoCodesManager.tsx`:

- Update the type import to include `AppliesToPlan`:
```ts
import type { PromoCodeWithUsage, CreatePromoCodeInput, AppliesToPlan } from '@/lib/promo-codes/types';
```

- Add `appliesToPlan` to the `EMPTY` constant:
```ts
const EMPTY: CreatePromoCodeInput = {
  code: '', discountType: 'percent', discountValue: 20,
  duration: 'once', durationInMonths: 3, maxRedemptions: null, expiresAt: null,
  appliesToPlan: 'both',
};
```

- Change the component signature:
```ts
export function PromoCodesManager({ communitySlug, yearlyEnabled }: { communitySlug: string; yearlyEnabled: boolean }) {
```

- Add the scope selector. Insert this block immediately BEFORE the `<Button type="submit" ...>Create code</Button>` line, inside the `<form>`:

```tsx
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
```

- Add a scope badge to the list. In the `<p className="text-sm text-muted-foreground">` block that describes each code, add before the `{c.active ? '' : ' · paused'}` line:

```tsx
                    {c.appliesToPlan === 'yearly' ? ' · yearly only' : c.appliesToPlan === 'monthly' ? ' · monthly only' : ''}
```

(The `create` handler already builds its payload with `...form`, so `appliesToPlan` is included automatically.)

- [ ] **Step 4: Pass yearlyEnabled from the admin page**

In `app/[communitySlug]/admin/(with-nav)/promo-codes/page.tsx`:
- Add `yearly_enabled: boolean | null;` to the `Row` interface.
- Add `yearly_enabled` to the SELECT:
```ts
  const community = await queryOne<Row>`
    SELECT id, membership_enabled, membership_price, stripe_account_id, stripe_price_id, yearly_enabled
    FROM communities WHERE slug = ${communitySlug}
  `;
```
- Pass the prop:
```tsx
        <PromoCodesManager communitySlug={communitySlug} yearlyEnabled={Boolean(community.yearly_enabled)} />
```

- [ ] **Step 5: Run test + typecheck**

Run: `bun run test -- PromoCodesManager`
Expected: PASS (2 tests).
Run: `npx tsc --noEmit 2>&1 | grep -iE "PromoCodesManager|promo-codes/page" || echo "clean"`
Expected: `clean`.

- [ ] **Step 6: Commit**

```bash
git add components/admin/PromoCodesManager.tsx \
  "app/[communitySlug]/admin/(with-nav)/promo-codes/page.tsx" \
  __tests__/components/PromoCodesManager.test.tsx
git commit -m "feat(promo): owner scope selector and list badge (shown when yearly enabled)"
```

---

### Task 5: Full regression + preprod verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full affected suites**

Run: `bun run test -- promo-codes page-builder PromoCodesManager PaymentModal ManageSubscriptionModal`
Expected: all PASS. (Pre-existing unrelated suite failures noted in prior sessions are not caused by this work — judge by these suites + tsc.)

- [ ] **Step 2: Full typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -iE "error TS" | grep -iE "page-builder|promo|PaymentModal|promo-codes" || echo "clean in touched areas"`
Expected: `clean in touched areas`.

- [ ] **Step 3: Deploy to preprod and verify**

Push the branch and deploy:
```bash
git push origin feat/yearly-followups
cd /home/debian/apps/dance-hub && ./deploy-preprod.sh restart feat/yearly-followups
```
Then verify on `preprod.dance-hub.io`:
- A yearly-enabled community's About page CTA reads "Join community" (not a monthly price); a monthly-only community still reads "Join for €X/month".
- Owner Promo Codes page: the "Which plan can use this code?" selector appears only when yearly is enabled; create a "Yearly only" code and confirm the list badge.
- Join a yearly-enabled community: applying the "Yearly only" code succeeds on the yearly plan and is rejected on the monthly plan with "This code only applies to the yearly plan."; a "both" code works on either.

---

## Notes for prod rollout (after preprod sign-off)

Same shape as the yearly rollout: apply `supabase/migrations/2026-07-07_promo_applies_to_plan.sql` to prod `dance_hub` FIRST, then merge `feat/yearly-followups` to `main`, `./deploy.sh code`, and verify the fresh build id serves (watch the pm2 orphan footgun).
