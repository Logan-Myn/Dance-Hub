# Yearly Membership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a community owner offer an optional yearly membership (own price + free-text benefits) alongside the existing monthly one; let new members choose a plan at join; let existing monthly members upgrade to yearly, charged the prorated difference immediately.

**Architecture:** Approach A from the spec — four parallel columns on `communities`, reusing the single Stripe product with a second (yearly-interval) price. No new tables. Join and upgrade both go through the connected Stripe account. Upgrade uses `subscriptions.update` with `proration_behavior: 'always_invoice'`, with a 3DS confirmation fallback.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Neon-shaped `sql` tagged template over local Postgres (`lib/db.ts`), Stripe Connect (stripe-node, API `2025-12-15.clover`), Jest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-06-yearly-membership-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Branch/worktree:** all work happens on branch `feat/yearly-membership` in the worktree `/home/debian/apps/dance-hub-yearly`. NEVER build or test in the main repo `/home/debian/apps/dance-hub` (pm2 serves it as prod).
- **Test runner:** `bun run test` (Jest). NEVER `bun test` (Bun's runner gives false failures). Single file: `bun run test -- <path>`.
- **Stripe API version:** `2025-12-15.clover`. Invoices expose `confirmation_secret` (NOT `payment_intent`) for client confirmation — mirror `join-paid/route.ts`.
- **Stripe calls:** every Stripe call takes `{ stripeAccount: community.stripe_account_id }` as its final options argument.
- **Money units:** DB stores euros as `DECIMAL(10,2)`; Stripe `unit_amount` and invoice amounts are integer cents. Convert with `Math.round(euros * 100)` and `cents / 100`.
- **Plan value:** the plan discriminator is the string `'monthly' | 'yearly'`. Absent/unknown ⇒ treat as `'monthly'`.
- **UI copy:** no em dashes in user-facing strings (use periods/commas); no vendor brand names (Stripe/LiveKit/etc.) in user-facing strings. Teacher-authored benefits text is exempt.
- **Currency:** EUR throughout (matches existing monthly flow).

---

## File Structure

**Create:**
- `supabase/migrations/2026-07-06_add_yearly_membership.sql` — schema
- `app/api/community/[communitySlug]/subscription/upgrade-yearly/route.ts` — proration preview (GET) + commit upgrade (POST)
- `__tests__/api/yearly-membership/update-price-yearly.test.ts`
- `__tests__/api/yearly-membership/join-paid-plan.test.ts`
- `__tests__/api/yearly-membership/upgrade-yearly.test.ts`
- `__tests__/components/YearlyMembershipEditor.test.tsx` (owner config render)

**Modify:**
- `app/api/community/[communitySlug]/update-price/route.ts` — create/persist yearly price
- `app/api/community/[communitySlug]/join-paid/route.ts` — accept `plan`, pick price
- `app/api/community/[communitySlug]/subscription/route.ts` — return `upgrade` info
- `app/[communitySlug]/admin/(with-nav)/subscriptions/page.tsx` — select + pass yearly fields
- `components/admin/SubscriptionsEditor.tsx` — yearly config UI + save
- `app/[communitySlug]/FeedClient.tsx` — plan selector + pass `plan` to join-paid
- `components/PaymentModal.tsx` — carry `plan` through promo re-create + price label
- `components/community/ManageSubscriptionModal.tsx` — "Switch to yearly" CTA + confirm + 3DS
- `lib/community-data.ts` — add yearly fields to `CommunityRow` interface
- `__tests__/components/ManageSubscriptionModal.test.tsx` — add upgrade-CTA case

---

## Task 1: Migration — add yearly columns to `communities`

**Files:**
- Create: `supabase/migrations/2026-07-06_add_yearly_membership.sql`

**Interfaces:**
- Produces: columns `yearly_enabled boolean`, `yearly_price decimal(10,2)`, `stripe_yearly_price_id text`, `yearly_benefits text` on `communities`.

- [ ] **Step 1: Write the migration file**

`supabase/migrations/2026-07-06_add_yearly_membership.sql`:

```sql
-- Optional yearly membership, offered alongside the existing monthly one.
-- Reuses the community's existing stripe_product_id; only a second Price is added.
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS yearly_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS yearly_price           DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS stripe_yearly_price_id TEXT,
  ADD COLUMN IF NOT EXISTS yearly_benefits        TEXT;

CREATE INDEX IF NOT EXISTS idx_communities_stripe_yearly_price_id
  ON communities(stripe_yearly_price_id);
```

- [ ] **Step 2: Apply to the preprod database**

The connection string lives in the preprod env file. From the worktree:

Run:
```bash
cd /home/debian/apps/dance-hub-yearly
DB_URL=$(grep -E '^DATABASE_URL=' .env.preprod | cut -d= -f2- | tr -d '"')
psql "$DB_URL" -f supabase/migrations/2026-07-06_add_yearly_membership.sql
```
Expected: four `ALTER TABLE` / `CREATE INDEX` notices, no errors. (If `.env.preprod` is absent in the worktree, copy it from `/home/debian/apps/dance-hub-preprod/.env.preprod` first — never use the main repo's prod `.env.local`.)

- [ ] **Step 3: Verify the columns exist**

Run:
```bash
psql "$DB_URL" -c "\d communities" | grep -E "yearly_enabled|yearly_price|stripe_yearly_price_id|yearly_benefits"
```
Expected: all four rows printed with the right types.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-07-06_add_yearly_membership.sql
git commit -m "feat(yearly): add yearly membership columns to communities"
```

*(Prod `dance_hub` gets this same migration in Task 9, after preprod sign-off.)*

---

## Task 2: `update-price` route — create/persist the yearly Stripe price

**Files:**
- Modify: `app/api/community/[communitySlug]/update-price/route.ts`
- Test: `__tests__/api/yearly-membership/update-price-yearly.test.ts`

**Interfaces:**
- Consumes: request body `{ price: number, enabled: boolean, yearlyEnabled?: boolean, yearlyPrice?: number, yearlyBenefits?: string | null }`.
- Produces: persists `yearly_enabled`, `yearly_price`, `stripe_yearly_price_id`, `yearly_benefits`; response `{ success, stripe_price_id, stripe_yearly_price_id }`.

- [ ] **Step 1: Write the failing test**

`__tests__/api/yearly-membership/update-price-yearly.test.ts`:

```ts
import { POST } from '@/app/api/community/[communitySlug]/update-price/route';

const mockProductsCreate = jest.fn();
const mockPricesCreate = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    products: { create: (...a: unknown[]) => mockProductsCreate(...a) },
    prices: { create: (...a: unknown[]) => mockPricesCreate(...a) },
  },
}));
const mockSql = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({ sql: (...a: unknown[]) => mockSql(...a), queryOne: (...a: unknown[]) => mockQueryOne(...a) }));

const params = Promise.resolve({ communitySlug: 'salsa' });
const community = {
  id: 'c1', name: 'Salsa', created_by: 'owner1',
  stripe_product_id: 'prod_1', stripe_account_id: 'acct_1',
};

beforeEach(() => {
  [mockProductsCreate, mockPricesCreate, mockSql, mockQueryOne].forEach((m) => m.mockReset());
});

function req(body: object) {
  return new Request('http://x', { method: 'POST', body: JSON.stringify(body) });
}

it('creates a yearly Stripe price on the existing product and persists it', async () => {
  mockQueryOne.mockResolvedValueOnce(community);
  mockPricesCreate
    .mockResolvedValueOnce({ id: 'price_month' })  // monthly
    .mockResolvedValueOnce({ id: 'price_year' });   // yearly
  mockSql.mockResolvedValue([]);

  const res = await POST(
    req({ price: 20, enabled: true, yearlyEnabled: true, yearlyPrice: 200, yearlyBenefits: '2 months free plus a private class.' }),
    { params },
  );

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ stripe_yearly_price_id: 'price_year' });
  // yearly price uses the year interval and the same product
  expect(mockPricesCreate).toHaveBeenCalledWith(
    expect.objectContaining({ product: 'prod_1', unit_amount: 20000, recurring: { interval: 'year' } }),
    { stripeAccount: 'acct_1' },
  );
});

it('does not create a yearly price when yearlyEnabled is false', async () => {
  mockQueryOne.mockResolvedValueOnce(community);
  mockPricesCreate.mockResolvedValueOnce({ id: 'price_month' });
  mockSql.mockResolvedValue([]);

  await POST(req({ price: 20, enabled: true, yearlyEnabled: false, yearlyPrice: 0 }), { params });

  const intervals = mockPricesCreate.mock.calls.map((c) => (c[0] as any).recurring?.interval);
  expect(intervals).not.toContain('year');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- __tests__/api/yearly-membership/update-price-yearly.test.ts`
Expected: FAIL (yearly price not created; `stripe_yearly_price_id` undefined).

- [ ] **Step 3: Implement**

In `app/api/community/[communitySlug]/update-price/route.ts`, read the new fields and add a yearly branch. Replace the body-parse line and add the yearly logic after the existing monthly price block, before the final `UPDATE`.

Change the destructure at the top of `POST`:
```ts
const { price, enabled, yearlyEnabled, yearlyPrice, yearlyBenefits } = await request.json();
```

After the existing monthly `stripe_price_id` is computed (and the product exists), add:
```ts
// Yearly price (optional). Reuse the same product; create a second Price with
// a yearly interval. Stripe prices are immutable, so a changed price = new id.
let stripe_yearly_price_id: string | null = null;
if (enabled && yearlyEnabled && yearlyPrice > 0) {
  if (!stripeAccountId) {
    return NextResponse.json({ error: "Stripe account not connected" }, { status: 400 });
  }
  // product_id is guaranteed here because the monthly branch above created/loaded it.
  const yearlyStripePrice = await stripe.prices.create(
    {
      product: product_id!,
      unit_amount: Math.round(yearlyPrice * 100),
      currency: "eur",
      recurring: { interval: "year" },
    },
    { stripeAccount: stripeAccountId },
  );
  stripe_yearly_price_id = yearlyStripePrice.id;
}
```

Then extend BOTH `UPDATE communities` statements (the enabled branch and the else branch) to persist the yearly columns. Enabled branch:
```ts
await sql`
  UPDATE communities
  SET
    membership_enabled = ${enabled},
    membership_price = ${price},
    stripe_product_id = ${product_id},
    stripe_price_id = ${stripe_price_id},
    yearly_enabled = ${!!yearlyEnabled && !!stripe_yearly_price_id},
    yearly_price = ${yearlyEnabled ? yearlyPrice : null},
    stripe_yearly_price_id = ${stripe_yearly_price_id ?? null},
    yearly_benefits = ${yearlyBenefits ?? null},
    updated_at = NOW()
  WHERE id = ${community.id}
`;
```
Note: `product_id` and `stripe_price_id` are declared with `let` in the existing code. Ensure the yearly block runs while `product_id` is in scope (it is — same function). Then return:
```ts
return NextResponse.json({ success: true, stripe_price_id, stripe_yearly_price_id });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- __tests__/api/yearly-membership/update-price-yearly.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add app/api/community/[communitySlug]/update-price/route.ts __tests__/api/yearly-membership/update-price-yearly.test.ts
git commit -m "feat(yearly): create and persist yearly Stripe price in update-price"
```

---

## Task 3: `join-paid` route — accept `plan`, select the right price

**Files:**
- Modify: `app/api/community/[communitySlug]/join-paid/route.ts`
- Test: `__tests__/api/yearly-membership/join-paid-plan.test.ts`

**Interfaces:**
- Consumes: request body gains optional `plan: 'monthly' | 'yearly'` (alongside existing `userId`, `email`, `promotionCodeId`).
- Produces: subscription created on `stripe_yearly_price_id` when `plan === 'yearly'`, else `stripe_price_id`. Response unchanged (`clientSecret`, `requiresSetup`, `stripeAccountId`, `subscriptionId`).

- [ ] **Step 1: Write the failing test**

`__tests__/api/yearly-membership/join-paid-plan.test.ts`:

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
  id: 'c1', membership_price: 20, stripe_account_id: 'acct_1', stripe_price_id: 'price_month',
  stripe_yearly_price_id: 'price_year', yearly_enabled: true,
  active_member_count: 5, created_at: '2020-01-01T00:00:00.000Z', promotional_fee_percentage: null,
};

beforeEach(() => {
  [mockCustomersCreate, mockSubscriptionsCreate, mockSubscriptionsCancel, mockSetupIntentsCreate, mockSql, mockQueryOne]
    .forEach((m) => m.mockReset());
});

function req(body: object) {
  return new Request('http://x', { method: 'POST', body: JSON.stringify(body) });
}

function stubSubscriptionOk() {
  mockCustomersCreate.mockResolvedValueOnce({ id: 'cus_1' });
  mockSubscriptionsCreate.mockResolvedValueOnce({
    id: 'sub_1', latest_invoice: { id: 'in_1', amount_due: 20000, confirmation_secret: { client_secret: 'pi_secret' } },
  });
  mockSql.mockResolvedValue([]);
}

it('subscribes on the yearly price when plan is yearly', async () => {
  mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce(null);
  stubSubscriptionOk();

  const res = await POST(req({ userId: 'u1', email: 'u1@x.com', plan: 'yearly' }), { params });

  expect(res.status).toBe(200);
  expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
    expect.objectContaining({ items: [{ price: 'price_year' }] }),
    { stripeAccount: 'acct_1' },
  );
});

it('subscribes on the monthly price when plan is omitted', async () => {
  mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce(null);
  stubSubscriptionOk();

  await POST(req({ userId: 'u1', email: 'u1@x.com' }), { params });

  expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
    expect.objectContaining({ items: [{ price: 'price_month' }] }),
    { stripeAccount: 'acct_1' },
  );
});

it('rejects a yearly plan when the community has no yearly price configured', async () => {
  mockQueryOne.mockResolvedValueOnce({ ...community, yearly_enabled: false, stripe_yearly_price_id: null }).mockResolvedValueOnce(null);

  const res = await POST(req({ userId: 'u1', email: 'u1@x.com', plan: 'yearly' }), { params });

  expect(res.status).toBe(400);
  expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- __tests__/api/yearly-membership/join-paid-plan.test.ts`
Expected: FAIL (subscription always uses `stripe_price_id`; yearly rejection not implemented).

- [ ] **Step 3: Implement**

In `app/api/community/[communitySlug]/join-paid/route.ts`:

Add to the `Community` interface:
```ts
  stripe_yearly_price_id: string | null;
  yearly_enabled: boolean | null;
```
Extend the SELECT to include them:
```ts
    const community = await queryOne<Community>`
      SELECT id, membership_price, stripe_account_id, stripe_price_id, stripe_yearly_price_id, yearly_enabled, active_member_count, created_at, promotional_fee_percentage
      FROM communities
      WHERE slug = ${params.communitySlug}
    `;
```
Change the body destructure:
```ts
    const { userId, email, promotionCodeId, plan } = await request.json();
```
Replace the existing `if (!community.stripe_price_id)` guard with plan-aware price selection (right after the `community` null-check):
```ts
    const useYearly = plan === 'yearly';
    if (useYearly && (!community.yearly_enabled || !community.stripe_yearly_price_id)) {
      return NextResponse.json({ error: "Yearly membership is not available for this community" }, { status: 400 });
    }
    const selectedPriceId = useYearly ? community.stripe_yearly_price_id : community.stripe_price_id;
    if (!selectedPriceId) {
      return NextResponse.json({ error: "Community membership price not configured" }, { status: 400 });
    }
```
Then in the `stripe.subscriptions.create` call, replace `items: [{ price: community.stripe_price_id }]` with:
```ts
        items: [{ price: selectedPriceId }],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- __tests__/api/yearly-membership/join-paid-plan.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 5: Run the existing join-paid promo test (regression)**

Run: `bun run test -- __tests__/api/promo-codes/join-paid-discount.test.ts`
Expected: PASS (unchanged behavior for the monthly + promo paths).

- [ ] **Step 6: Commit**

```bash
git add "app/api/community/[communitySlug]/join-paid/route.ts" __tests__/api/yearly-membership/join-paid-plan.test.ts
git commit -m "feat(yearly): select monthly or yearly price in join-paid by plan"
```

---

## Task 4: Owner config UI — yearly section in `SubscriptionsEditor`

**Files:**
- Modify: `app/[communitySlug]/admin/(with-nav)/subscriptions/page.tsx`
- Modify: `components/admin/SubscriptionsEditor.tsx`
- Test: `__tests__/components/YearlyMembershipEditor.test.tsx`

**Interfaces:**
- Consumes: `SubscriptionsEditorProps` gains `initialYearlyEnabled: boolean`, `initialYearlyPrice: number`, `initialYearlyBenefits: string`.
- Produces: `handlePriceUpdate` POSTs `{ price, enabled, yearlyEnabled, yearlyPrice, yearlyBenefits }` to `update-price` (matches Task 2's consumed shape).

- [ ] **Step 1: Wire the RSC props (page)**

In `app/[communitySlug]/admin/(with-nav)/subscriptions/page.tsx`, extend `SubscriptionsRow` and the SELECT and the JSX props:

```ts
interface SubscriptionsRow {
  id: string;
  stripe_account_id: string | null;
  membership_enabled: boolean | null;
  membership_price: number | null;
  yearly_enabled: boolean | null;
  yearly_price: number | null;
  yearly_benefits: string | null;
  created_at: string;
}
```
```ts
  const community = await queryOne<SubscriptionsRow>`
    SELECT id, stripe_account_id, membership_enabled, membership_price,
           yearly_enabled, yearly_price, yearly_benefits, created_at
    FROM communities
    WHERE slug = ${params.communitySlug}
  `;
```
Add to the `<SubscriptionsEditor ... />` element:
```tsx
        initialYearlyEnabled={community.yearly_enabled ?? false}
        initialYearlyPrice={community.yearly_price ?? 0}
        initialYearlyBenefits={community.yearly_benefits ?? ""}
```

- [ ] **Step 2: Add props + state (SubscriptionsEditor)**

In `components/admin/SubscriptionsEditor.tsx`, extend `SubscriptionsEditorProps`:
```ts
  initialYearlyEnabled: boolean;
  initialYearlyPrice: number;
  initialYearlyBenefits: string;
```
Add to the destructured params and to component state (next to `price`):
```ts
  const [isYearlyEnabled, setIsYearlyEnabled] = useState(initialYearlyEnabled);
  const [yearlyPrice, setYearlyPrice] = useState(initialYearlyPrice);
  const [yearlyBenefits, setYearlyBenefits] = useState(initialYearlyBenefits);
```

- [ ] **Step 3: Send yearly fields on save**

In `handlePriceUpdate`, extend the POST body and the dependency array:
```ts
        body: JSON.stringify({
          price,
          enabled: isMembershipEnabled,
          yearlyEnabled: isYearlyEnabled,
          yearlyPrice,
          yearlyBenefits,
        }),
```
```ts
  }, [communitySlug, price, isMembershipEnabled, isYearlyEnabled, yearlyPrice, yearlyBenefits, router]);
```

- [ ] **Step 4: Add the yearly UI block**

Inside `renderMembershipSettings`, within the `{isMembershipEnabled && (...)}` block, after the monthly price `<div>` (the one ending at the "Set the monthly price..." helper), add:

```tsx
            <div className="pt-4 border-t border-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-foreground">
                    Offer a yearly plan
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add an annual option members can pick instead of paying monthly.
                  </p>
                </div>
                <Switch checked={isYearlyEnabled} onCheckedChange={setIsYearlyEnabled} />
              </div>

              {isYearlyEnabled && (
                <div className="space-y-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Yearly Membership Price
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <span className="text-muted-foreground font-medium">€</span>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={yearlyPrice}
                        onChange={(e) => setYearlyPrice(Number(e.target.value))}
                        className="pl-8 rounded-xl border-border/50"
                        placeholder="0.00"
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Tip: pricing the year at about 10x the monthly price gives members roughly 2 months free.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      What members get with the yearly plan
                    </label>
                    <textarea
                      value={yearlyBenefits}
                      onChange={(e) => setYearlyBenefits(e.target.value)}
                      rows={3}
                      className="w-full rounded-xl border border-border/50 bg-background p-3 text-sm"
                      placeholder="e.g. 2 months free plus one private class."
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Shown to members when they choose a plan.
                    </p>
                  </div>
                </div>
              )}
            </div>
```

*(If `textarea` styling looks out of place, reuse the project's `Textarea` UI component if one exists under `components/ui/`; otherwise the raw element above is fine.)*

- [ ] **Step 5: Write a render test**

`__tests__/components/YearlyMembershipEditor.test.tsx`:

```tsx
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { SubscriptionsEditor } from "@/components/admin/SubscriptionsEditor";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ session: null }) }));

// Force the Stripe status island to treat the account as enabled so the
// membership settings (and our yearly block) render.
beforeAll(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ isEnabled: true, needsSetup: false, details: {} }) }),
  ) as any;
});

it("reveals yearly price + benefits inputs when the yearly toggle is on", () => {
  render(
    <SubscriptionsEditor
      communityId="c1"
      communitySlug="salsa"
      initialStripeAccountId="acct_1"
      initialMembershipEnabled={true}
      initialMembershipPrice={20}
      initialYearlyEnabled={true}
      initialYearlyPrice={200}
      initialYearlyBenefits="2 months free."
      communityCreatedAt={new Date().toISOString()}
    />,
  );

  expect(screen.getByText(/Yearly Membership Price/)).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/2 months free plus one private class/)).toBeInTheDocument();
});
```

*(If the Stripe-enabled gating makes the block hard to reach in JSDOM, assert instead on the `initialYearlyEnabled={false}` case toggled on via `fireEvent.click` of the "Offer a yearly plan" switch. Keep whichever renders reliably; the goal is a smoke test that the yearly inputs mount.)*

- [ ] **Step 6: Run the test**

Run: `bun run test -- __tests__/components/YearlyMembershipEditor.test.tsx`
Expected: PASS. If it fails only because the Stripe-status gate hides the block, apply the fallback in the parenthetical and re-run.

- [ ] **Step 7: Commit**

```bash
git add "app/[communitySlug]/admin/(with-nav)/subscriptions/page.tsx" components/admin/SubscriptionsEditor.tsx __tests__/components/YearlyMembershipEditor.test.tsx
git commit -m "feat(yearly): owner config UI for the yearly plan"
```

---

## Task 5: Member join UI — plan selector + pass `plan` to join-paid

**Files:**
- Modify: `lib/community-data.ts` (interface only)
- Modify: `app/[communitySlug]/FeedClient.tsx`
- Modify: `components/PaymentModal.tsx`

**Interfaces:**
- Consumes: FeedClient's `community` prop gains `yearlyEnabled?`, `yearlyPrice?`, `yearly_price?`, `yearlyBenefits?` (mirrors the existing dual camel/snake membership fields).
- Produces: `startPaidJoin(plan: 'monthly' | 'yearly')` sends `plan` to `join-paid`; `PaymentModal` receives `plan` and forwards it in `applyPromo`.

- [ ] **Step 1: Extend the data interface**

In `lib/community-data.ts`, add to `CommunityRow`:
```ts
  yearly_enabled?: boolean | null;
  yearly_price?: number | string | null;
  yearly_benefits?: string | null;
```
(The community query uses `SELECT *`, so no query change is needed.)

- [ ] **Step 2: Extend FeedClient's Community interface + mapping**

In `app/[communitySlug]/FeedClient.tsx`, add to the `interface Community` (near `membershipPrice`):
```ts
  yearlyEnabled?: boolean;
  yearlyPrice?: number;
  yearly_price?: number;
  yearlyBenefits?: string;
```
Wherever the parent page builds the `community` object passed to `FeedClient` (same place it sets `membershipEnabled` / `membershipPrice`), map the yearly fields through the same way. Add `yearlyEnabled`, `yearlyPrice` (Number-coerced), and `yearlyBenefits`.

- [ ] **Step 3: Make `startPaidJoin` plan-aware**

Change the signature and body:
```ts
  const startPaidJoin = async (plan: 'monthly' | 'yearly' = 'monthly') => {
    if (!currentUser) return;
    try {
      const response = await fetch(`/api/community/${communitySlug}/join-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id, email: currentUser.email, plan }),
      });
      if (!response.ok) throw new Error("Failed to create payment");
      const { clientSecret, requiresSetup, stripeAccountId } = await response.json();
      setPaymentClientSecret(clientSecret);
      setStripeAccountId(stripeAccountId);
      setPaymentMode(requiresSetup ? 'setup' : 'payment');
      setSelectedPlan(plan);
      setShowPaymentModal(true);
    } catch (err) {
      console.error(err);
      toast.error("Failed to start checkout");
    }
  };
```
Add state near the other payment state:
```ts
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [showPlanChooser, setShowPlanChooser] = useState(false);
```

- [ ] **Step 4: Show a plan chooser when yearly is enabled**

In the join click handler (`handleJoinCommunity`, the paid branch that currently leads to `startPaidJoin`), branch on yearly availability:
```ts
    if (community?.yearlyEnabled && (community?.yearlyPrice ?? 0) > 0) {
      setShowPlanChooser(true);   // let the member pick monthly vs yearly
      return;
    }
    await startPaidJoin('monthly');
```
Add a small chooser dialog (reuse the project `Dialog` primitives already imported for other modals). Render near the other modals at the bottom of the component:
```tsx
      <Dialog open={showPlanChooser} onOpenChange={setShowPlanChooser}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Choose your plan</DialogTitle>
            <DialogDescription>Pick how you want to pay.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => { setShowPlanChooser(false); startPaidJoin('monthly'); }}
              className="rounded-xl border border-border/60 p-4 text-left hover:border-primary transition-colors"
            >
              <div className="font-semibold">€{community.membershipPrice}/month</div>
              <div className="text-sm text-muted-foreground">Billed monthly. Cancel anytime.</div>
            </button>
            <button
              type="button"
              onClick={() => { setShowPlanChooser(false); startPaidJoin('yearly'); }}
              className="rounded-xl border border-primary/60 bg-primary/5 p-4 text-left hover:border-primary transition-colors"
            >
              <div className="font-semibold">€{community.yearlyPrice}/year</div>
              {community.yearlyBenefits && (
                <div className="text-sm text-muted-foreground whitespace-pre-line mt-1">
                  {community.yearlyBenefits}
                </div>
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>
```
(If `Dialog`, `DialogContent`, etc. are not already imported in FeedClient, add them from `@/components/ui/dialog`.)

- [ ] **Step 5: Pass the chosen plan into PaymentModal + its price label**

Update the `<PaymentModal ... />` usage to pass the plan and the correct price:
```tsx
        price={selectedPlan === 'yearly' ? (community.yearlyPrice || 0) : (community.membershipPrice || 0)}
        plan={selectedPlan}
```
In `components/PaymentModal.tsx`, add `plan` to `PaymentModalProps` and `PaymentFormProps`:
```ts
  plan?: 'monthly' | 'yearly';
```
Thread it into `PaymentForm` and use it for the button label (replace the hardcoded `/month`):
```tsx
          mode === 'setup' ? 'Save card and join' : `Pay €${price}/${plan === 'yearly' ? 'year' : 'month'}`
```
In `applyPromo`, include the plan so re-creating the discounted subscription keeps the yearly price:
```ts
        body: JSON.stringify({ userId: user.id, email: user.email, promotionCodeId: v.promotionCodeId, plan }),
```
(Destructure `plan` from the component props and pass it to `<PaymentForm ... plan={plan} />`.)

- [ ] **Step 6: Typecheck + regression test**

Run: `bun run test -- __tests__/api/promo-codes/join-paid-discount.test.ts` (still green)
Run: `cd /home/debian/apps/dance-hub-yearly && bunx tsc --noEmit` (no new type errors in the touched files)
Expected: PASS / clean. This flow is verified end-to-end on preprod in Task 9.

- [ ] **Step 7: Commit**

```bash
git add lib/community-data.ts "app/[communitySlug]/FeedClient.tsx" components/PaymentModal.tsx
git commit -m "feat(yearly): plan chooser at join and plan-aware payment modal"
```

---

## Task 6: Upgrade backend — preview (GET) + commit (POST)

**Files:**
- Create: `app/api/community/[communitySlug]/subscription/upgrade-yearly/route.ts`
- Test: `__tests__/api/yearly-membership/upgrade-yearly.test.ts`

**Interfaces:**
- Consumes: session (`getSession`), member's `stripe_subscription_id`, community `stripe_yearly_price_id` / `yearly_price` / `yearly_enabled` / `stripe_account_id`.
- Produces:
  - `GET` ⇒ `{ prorationAmount: number /*cents*/, currency: string, yearlyAmount: number /*cents*/ }`
  - `POST` ⇒ `{ status: 'succeeded' }` OR `{ requiresAction: true, clientSecret: string }`

- [ ] **Step 1: Write the failing test**

`__tests__/api/yearly-membership/upgrade-yearly.test.ts`:

```ts
import { GET, POST } from '@/app/api/community/[communitySlug]/subscription/upgrade-yearly/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({ queryOne: (...a: unknown[]) => mockQueryOne(...a), sql: jest.fn() }));
const mockSubRetrieve = jest.fn();
const mockSubUpdate = jest.fn();
const mockInvoicePreview = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    subscriptions: { retrieve: (...a: unknown[]) => mockSubRetrieve(...a), update: (...a: unknown[]) => mockSubUpdate(...a) },
    invoices: { createPreview: (...a: unknown[]) => mockInvoicePreview(...a) },
  },
}));

const params = Promise.resolve({ communitySlug: 'salsa' });
const community = { id: 'c1', stripe_account_id: 'acct_1', yearly_enabled: true, yearly_price: 200, stripe_yearly_price_id: 'price_year' };
const member = { stripe_subscription_id: 'sub_1' };
const subWithMonthlyItem = { items: { data: [{ id: 'si_1', price: { recurring: { interval: 'month' } } }] } };

beforeEach(() => {
  [mockGetSession, mockQueryOne, mockSubRetrieve, mockSubUpdate, mockInvoicePreview].forEach((m) => m.mockReset());
});

it('GET previews the prorated amount', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'u1' } });
  mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce(member);
  mockSubRetrieve.mockResolvedValueOnce(subWithMonthlyItem);
  mockInvoicePreview.mockResolvedValueOnce({ amount_due: 18000, currency: 'eur' });

  const res = await GET(new Request('http://x'), { params });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ prorationAmount: 18000, currency: 'eur', yearlyAmount: 20000 });
  expect(mockInvoicePreview).toHaveBeenCalledWith(
    expect.objectContaining({
      subscription: 'sub_1',
      subscription_details: expect.objectContaining({ items: [{ id: 'si_1', price: 'price_year' }] }),
    }),
    { stripeAccount: 'acct_1' },
  );
});

it('POST switches to yearly and reports success when the invoice is paid', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'u1' } });
  mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce(member);
  mockSubRetrieve.mockResolvedValueOnce(subWithMonthlyItem);
  mockSubUpdate.mockResolvedValueOnce({ id: 'sub_1', latest_invoice: { status: 'paid' } });

  const res = await POST(new Request('http://x', { method: 'POST' }), { params });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: 'succeeded' });
  expect(mockSubUpdate).toHaveBeenCalledWith(
    'sub_1',
    expect.objectContaining({ items: [{ id: 'si_1', price: 'price_year' }], proration_behavior: 'always_invoice' }),
    { stripeAccount: 'acct_1' },
  );
});

it('POST returns requiresAction with a client secret when 3DS is needed', async () => {
  mockGetSession.mockResolvedValueOnce({ user: { id: 'u1' } });
  mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce(member);
  mockSubRetrieve.mockResolvedValueOnce(subWithMonthlyItem);
  mockSubUpdate.mockResolvedValueOnce({ id: 'sub_1', latest_invoice: { status: 'open', confirmation_secret: { client_secret: 'pi_secret' } } });

  const res = await POST(new Request('http://x', { method: 'POST' }), { params });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ requiresAction: true, clientSecret: 'pi_secret' });
});

it('POST returns 401 without a session', async () => {
  mockGetSession.mockResolvedValueOnce(null);
  const res = await POST(new Request('http://x', { method: 'POST' }), { params });
  expect(res.status).toBe(401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- __tests__/api/yearly-membership/upgrade-yearly.test.ts`
Expected: FAIL with "route does not exist" / import error.

- [ ] **Step 3: Implement the route**

`app/api/community/[communitySlug]/subscription/upgrade-yearly/route.ts`:

```ts
import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { getSession } from "@/lib/auth-session";
import type Stripe from "stripe";

interface Community {
  id: string;
  stripe_account_id: string | null;
  yearly_enabled: boolean | null;
  yearly_price: number | string | null;
  stripe_yearly_price_id: string | null;
}
interface Member {
  stripe_subscription_id: string | null;
}

// Resolve the caller's monthly subscription + the community's yearly target.
// Returns a NextResponse on any failure, or the resolved context on success.
async function resolve(communitySlug: string) {
  const session = await getSession();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const userId = session.user.id;

  const community = await queryOne<Community>`
    SELECT id, stripe_account_id, yearly_enabled, yearly_price, stripe_yearly_price_id
    FROM communities WHERE slug = ${communitySlug}
  `;
  if (!community?.stripe_account_id) return { error: NextResponse.json({ error: "Community not found" }, { status: 404 }) };
  if (!community.yearly_enabled || !community.stripe_yearly_price_id) {
    return { error: NextResponse.json({ error: "Yearly plan not available" }, { status: 400 }) };
  }

  const member = await queryOne<Member>`
    SELECT stripe_subscription_id FROM community_members
    WHERE community_id = ${community.id} AND user_id = ${userId}
  `;
  if (!member?.stripe_subscription_id) return { error: NextResponse.json({ error: "No subscription found" }, { status: 404 }) };

  const sub = await stripe.subscriptions.retrieve(
    member.stripe_subscription_id,
    { expand: ["items.data.price"] },
    { stripeAccount: community.stripe_account_id },
  );
  const item = sub.items.data[0];
  if (!item) return { error: NextResponse.json({ error: "Subscription has no items" }, { status: 400 }) };
  if (item.price?.recurring?.interval === "year") {
    return { error: NextResponse.json({ error: "Already on the yearly plan" }, { status: 400 }) };
  }

  return {
    community,
    subId: member.stripe_subscription_id,
    itemId: item.id,
    stripeAccount: community.stripe_account_id,
    yearlyPriceId: community.stripe_yearly_price_id,
  };
}

export async function GET(_req: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await props.params;
  const ctx = await resolve(communitySlug);
  if ("error" in ctx) return ctx.error;

  try {
    const preview = await stripe.invoices.createPreview(
      {
        subscription: ctx.subId,
        subscription_details: {
          items: [{ id: ctx.itemId, price: ctx.yearlyPriceId }],
          proration_behavior: "create_prorations",
        },
      },
      { stripeAccount: ctx.stripeAccount },
    );
    return NextResponse.json({
      prorationAmount: preview.amount_due,
      currency: preview.currency,
      yearlyAmount: Math.round(Number(ctx.community.yearly_price) * 100),
    });
  } catch (err) {
    console.error("Upgrade preview failed:", err);
    return NextResponse.json({ error: "Could not preview the upgrade" }, { status: 500 });
  }
}

export async function POST(_req: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await props.params;
  const ctx = await resolve(communitySlug);
  if ("error" in ctx) return ctx.error;

  try {
    const sub = await stripe.subscriptions.update(
      ctx.subId,
      {
        items: [{ id: ctx.itemId, price: ctx.yearlyPriceId }],
        proration_behavior: "always_invoice",
        expand: ["latest_invoice.confirmation_secret"],
      },
      { stripeAccount: ctx.stripeAccount },
    );

    const invoice = sub.latest_invoice as Stripe.Invoice | null;
    if (invoice?.status === "paid") {
      return NextResponse.json({ status: "succeeded" });
    }
    const secret = (invoice as any)?.confirmation_secret?.client_secret as string | undefined;
    if (secret) {
      return NextResponse.json({ requiresAction: true, clientSecret: secret });
    }
    // No charge needed (e.g. a rare zero proration) — treat as done.
    return NextResponse.json({ status: "succeeded" });
  } catch (err) {
    console.error("Upgrade to yearly failed:", err);
    return NextResponse.json({ error: "Could not switch to yearly" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- __tests__/api/yearly-membership/upgrade-yearly.test.ts`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add "app/api/community/[communitySlug]/subscription/upgrade-yearly/route.ts" __tests__/api/yearly-membership/upgrade-yearly.test.ts
git commit -m "feat(yearly): upgrade-yearly preview + prorated commit route"
```

---

## Task 7: Upgrade UI — "Switch to yearly" in `ManageSubscriptionModal`

**Files:**
- Modify: `app/api/community/[communitySlug]/subscription/route.ts` (return `upgrade` info)
- Modify: `components/community/ManageSubscriptionModal.tsx`
- Modify: `__tests__/components/ManageSubscriptionModal.test.tsx`

**Interfaces:**
- Consumes: the `subscription` GET response gains `upgrade: { available: boolean; yearlyAmount: number; yearlyBenefits: string | null } | null`.
- Consumes: `subscription/upgrade-yearly` GET + POST from Task 6.

- [ ] **Step 1: Extend the subscription GET route**

In `app/api/community/[communitySlug]/subscription/route.ts`, extend the `Community` interface + SELECT to include yearly fields:
```ts
interface Community {
  id: string;
  stripe_account_id: string | null;
  yearly_enabled: boolean | null;
  yearly_price: number | string | null;
  yearly_benefits: string | null;
  stripe_yearly_price_id: string | null;
}
```
```ts
  const community = await queryOne<Community>`
    SELECT id, stripe_account_id, yearly_enabled, yearly_price, yearly_benefits, stripe_yearly_price_id
    FROM communities
    WHERE slug = ${params.communitySlug}
  `;
```
In the returned JSON, add an `upgrade` field computed from the live interval:
```ts
    const interval = price?.recurring?.interval ?? "month";
    const canUpgrade =
      interval === "month" && !!community.yearly_enabled && !!community.stripe_yearly_price_id;

    return NextResponse.json({
      status: sub.status,
      currency: price?.currency ?? "eur",
      amount: price?.unit_amount ?? 0,
      interval,
      currentPeriodEnd: (sub as any).current_period_end as number,
      defaultPaymentMethod: card ? { brand: card.brand, last4: card.last4 } : null,
      upgrade: canUpgrade
        ? {
            available: true,
            yearlyAmount: Math.round(Number(community.yearly_price) * 100),
            yearlyBenefits: community.yearly_benefits ?? null,
          }
        : null,
    });
```

- [ ] **Step 2: Add upgrade UI to the modal**

In `components/community/ManageSubscriptionModal.tsx`:

Extend `SubscriptionSummary`:
```ts
  upgrade: { available: boolean; yearlyAmount: number; yearlyBenefits: string | null } | null;
```
Add state + a preview loader near the other state:
```ts
  const [upgrading, setUpgrading] = useState(false);
  const [upgradePreview, setUpgradePreview] = useState<{ prorationAmount: number; currency: string; yearlyAmount: number } | null>(null);
  const [upgradeSecret, setUpgradeSecret] = useState<string | null>(null);
```
Add the handlers:
```ts
  const startUpgrade = async () => {
    try {
      const resp = await fetch(`/api/community/${communitySlug}/subscription/upgrade-yearly`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Could not preview the upgrade.");
      setUpgradePreview(data);
      setView("upgrade");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not preview the upgrade.");
    }
  };

  const confirmUpgrade = async () => {
    setUpgrading(true);
    try {
      const resp = await fetch(`/api/community/${communitySlug}/subscription/upgrade-yearly`, { method: "POST" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Could not switch to yearly.");
      if (data.requiresAction && data.clientSecret) {
        setUpgradeSecret(data.clientSecret);   // hand off to the 3DS confirm step
        return;
      }
      toast.success("You're on the yearly plan now.");
      setView("details");
      setUpgradePreview(null);
      fetchAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not switch to yearly.");
    } finally {
      setUpgrading(false);
    }
  };
```
Add a "Switch to yearly" section inside the `view === "details"` block, after the Plan `<section>`:
```tsx
            {summary.interval === "month" && summary.upgrade?.available && (
              <section>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                  Switch to yearly
                </h3>
                <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
                  <p className="text-sm">
                    Pay once a year: {formatMoney(summary.upgrade.yearlyAmount, summary.currency)}/year.
                  </p>
                  {summary.upgrade.yearlyBenefits && (
                    <p className="text-sm text-muted-foreground whitespace-pre-line mt-1">
                      {summary.upgrade.yearlyBenefits}
                    </p>
                  )}
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={startUpgrade}
                    disabled={summary.status !== "active"}
                  >
                    Switch to yearly
                  </Button>
                </div>
              </section>
            )}
```
Add the confirm + 3DS view after the `view === "update"` block:
```tsx
        {view === "upgrade" && upgradePreview && !upgradeSecret && (
          <div className="space-y-4 py-2">
            <p className="text-sm">
              You'll pay {formatMoney(upgradePreview.prorationAmount, upgradePreview.currency)} now for the
              rest of this period, then {formatMoney(upgradePreview.yearlyAmount, upgradePreview.currency)}/year.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setView("details"); setUpgradePreview(null); }} disabled={upgrading}>
                Cancel
              </Button>
              <Button onClick={confirmUpgrade} disabled={upgrading}>
                {upgrading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Switching</>) : "Confirm switch"}
              </Button>
            </div>
          </div>
        )}

        {view === "upgrade" && upgradeSecret && stripePromise && (
          <Elements stripe={stripePromise} options={{ clientSecret: upgradeSecret, appearance: { theme: "stripe" as const } }}>
            <UpgradeConfirmForm
              onDone={() => {
                setUpgradeSecret(null);
                setUpgradePreview(null);
                setView("details");
                toast.success("You're on the yearly plan now.");
                fetchAll();
              }}
              onCancel={() => { setUpgradeSecret(null); setUpgradePreview(null); setView("details"); }}
            />
          </Elements>
        )}
```
Add the `UpgradeConfirmForm` component (mirror `UpdateCardForm`, but confirm a payment):
```tsx
function UpgradeConfirmForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    try {
      const { error } = await stripe.confirmPayment({ elements, redirect: "if_required" });
      if (error) throw error;
      onDone();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not complete the switch.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      <p className="text-sm text-muted-foreground">Your bank needs to confirm this payment.</p>
      <PaymentElement />
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="submit" disabled={!stripe || submitting}>
          {submitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Confirming</>) : "Confirm payment"}
        </Button>
      </div>
    </form>
  );
}
```
Also reset the upgrade state when the modal closes (in the `if (!isOpen)` effect):
```ts
      setUpgradePreview(null);
      setUpgradeSecret(null);
```

- [ ] **Step 3: Add a test case for the CTA**

In `__tests__/components/ManageSubscriptionModal.test.tsx`, add `upgrade` to `summaryFixture` and a new test:

```tsx
it("offers a yearly switch for a monthly member when yearly is available", async () => {
  mockFetch({
    "/subscription": {
      ...summaryFixture,
      interval: "month",
      upgrade: { available: true, yearlyAmount: 20000, yearlyBenefits: "2 months free." },
    },
    "/subscription/payments": { invoices: [] },
  });

  render(
    <ManageSubscriptionModal isOpen={true} onClose={() => {}} communitySlug="test" stripeAccountId="acct_test" />
  );

  await waitFor(() => expect(screen.getByRole("button", { name: /Switch to yearly/ })).toBeInTheDocument());
  expect(screen.getByText(/2 months free\./)).toBeInTheDocument();
});
```
Update the existing "renders plan..." test's `summaryFixture` to include `upgrade: null` so the type stays consistent (the fixture is shared; add `upgrade: null` to the base `summaryFixture` object).

- [ ] **Step 4: Run the tests**

Run: `bun run test -- __tests__/components/ManageSubscriptionModal.test.tsx`
Expected: PASS (existing cases + the new one). The 3DS confirm form is verified live on preprod.

- [ ] **Step 5: Commit**

```bash
git add "app/api/community/[communitySlug]/subscription/route.ts" components/community/ManageSubscriptionModal.tsx __tests__/components/ManageSubscriptionModal.test.tsx
git commit -m "feat(yearly): switch-to-yearly upgrade UI with proration preview and 3DS"
```

---

## Task 8: Webhook + edge-case audit

**Files:**
- Read/verify: `app/api/webhooks/stripe/route.ts`

**Interfaces:** none (verification task).

- [ ] **Step 1: Confirm the webhook is interval-agnostic**

Run:
```bash
cd /home/debian/apps/dance-hub-yearly
grep -n "interval\|'month'\|\"month\"\|per month\|/month" app/api/webhooks/stripe/route.ts
```
Expected: no logic that assumes a monthly interval for membership subscription status handling. If a hardcoded assumption exists (e.g. computing a period from "month"), note it and adjust so yearly subs are handled by the same status/period logic. If nothing matches, no change is needed.

- [ ] **Step 2: Confirm promo + yearly compose**

Re-read the 100%-off SetupIntent branch in `join-paid/route.ts` (already generic on `amount_due === 0`). Confirm it does not reference the monthly price specifically. No code change expected.

- [ ] **Step 3: Commit only if a change was needed**

```bash
git add app/api/webhooks/stripe/route.ts
git commit -m "fix(yearly): make membership webhook handling interval-agnostic"
```
(Skip the commit if Steps 1-2 found nothing to change; record the finding in the task notes instead.)

---

## Task 9: Preprod deploy + full test matrix

**Files:** none (deployment + manual verification).

**Interfaces:** none.

- [ ] **Step 1: Full test + typecheck in the worktree**

Run:
```bash
cd /home/debian/apps/dance-hub-yearly
bun run test
bunx tsc --noEmit
```
Expected: all tests pass; no new type errors.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feat/yearly-membership
```

- [ ] **Step 3: Ensure the preprod DB has the migration**

Already applied in Task 1 Step 2. If deploying from a clean preprod DB, re-run the migration against `dance_hub_preprod` before restarting.

- [ ] **Step 4: Deploy to preprod**

Run:
```bash
./deploy-preprod.sh restart feat/yearly-membership
```
Then open `https://preprod.dance-hub.io` (Stripe TEST mode).

- [ ] **Step 5: Run the test matrix (Stripe TEST cards, e.g. 4242… success, 4000 0027 6000 3184 for 3DS)**

- [ ] Owner enables yearly (price + benefits); it saves and reloads with the values retained.
- [ ] A new member on a yearly-enabled community sees the plan chooser, picks **yearly**, pays, and becomes active on a yearly sub (confirm interval in Manage subscription).
- [ ] A new member picks **monthly** — unchanged path still works.
- [ ] A promo code applied during a **yearly** join discounts the yearly price.
- [ ] An existing **monthly** member sees "Switch to yearly", the preview shows a sensible prorated amount, confirms, and the plan flips to yearly with an immediate charge (happy path, 4242 card).
- [ ] Upgrade with the **3DS** test card surfaces the confirm step and completes after authentication; abandoning it leaves the member on monthly with an honest message.

- [ ] **Step 6: Report results**

Summarize pass/fail per matrix row. Fix any failures on the branch, redeploy, re-test. Do NOT deploy to prod until every row passes.

---

## Post-plan: production rollout (after preprod sign-off)

Not a task to execute now — captured for completeness:
1. Apply `2026-07-06_add_yearly_membership.sql` to prod `dance_hub`.
2. Merge `feat/yearly-membership` to `main`.
3. Deploy prod with `./deploy.sh code`.

---

## Self-Review

- **Spec coverage:** Data model → Task 1. Owner config (`update-price` + editor) → Tasks 2, 4. Join plan choice → Tasks 3, 5. Prorated upgrade + 3DS → Tasks 6, 7. Webhook/edge cases → Task 8. Copy conventions → Global Constraints + enforced in UI tasks. Rollout/test matrix → Task 9 + post-plan. Soft pricing hint → Task 4 Step 4. All spec sections mapped.
- **Placeholder scan:** No TBD/TODO; every code step shows real code; commands have expected output. The two parentheticals in Tasks 4/5 are explicit fallbacks, not deferrals.
- **Type consistency:** `plan: 'monthly' | 'yearly'` used identically in Tasks 3, 5. `upgrade` object shape (`available`, `yearlyAmount`, `yearlyBenefits`) matches between Task 7 route and modal. `stripe_yearly_price_id` / `yearly_price` column names consistent across Tasks 1, 2, 3, 6, 7. Amounts in cents at every Stripe/`formatMoney` boundary.
