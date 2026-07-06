# Yearly Membership Option — Design

- **Date:** 2026-07-06
- **Status:** Approved design, pending implementation plan
- **Feature branch:** `feat/yearly-membership`
- **Test environment:** preprod.dance-hub.io (local Postgres `dance_hub_preprod`, Stripe TEST mode)

## Context

Today a paid community offers exactly **one** membership: a monthly subscription.
Pricing is configured by the owner and cached on the `communities` row.

- **Owner config** (`app/api/community/[communitySlug]/update-price/route.ts`): creates one
  Stripe Product (`"{name} Membership"`) plus one Stripe Price hardcoded to
  `recurring: { interval: "month" }`, and stores `membership_price`, `stripe_product_id`,
  `stripe_price_id`, `membership_enabled` on `communities`.
- **Join** (`app/api/community/[communitySlug]/join-paid/route.ts`): creates a Stripe
  subscription on the single `stripe_price_id`, with a tiered platform application fee and
  optional promo-code discount, and inserts a `community_members` row.
- **Join UI**: `FeedClient` creates the subscription up front, then opens `PaymentModal`
  (`components/PaymentModal.tsx`) with the resulting `clientSecret`. The promo entry inside the
  modal re-creates the subscription with the discount attached.
- **Member management** (`components/community/ManageSubscriptionModal.tsx` +
  `app/api/community/[communitySlug]/subscription/route.ts`): the subscription GET already
  returns the live `interval` read from the Stripe price.

Marcela (a teacher) asked for an **optional yearly membership** the teacher can enable
alongside monthly, with a teacher-authored benefits description (e.g. "2 months free + one
private class") to nudge members toward the annual plan.

## Goals

1. A community owner can enable an optional **yearly** membership with its own price and a
   free-text benefits blurb, in addition to the existing monthly membership.
2. A new member joining a community with yearly enabled can **choose monthly or yearly** and
   pay for the chosen plan.
3. An existing **monthly** member can **upgrade to yearly**, charged the prorated difference
   immediately against the card on file.

## Non-goals (deferred)

- Yearly → monthly downgrade.
- Enforced perks / credits (e.g. redeemable private-class credit). Benefits text is purely
  promotional and not tracked or enforced.
- Multi-tier / arbitrary plan systems. Only monthly + yearly.
- Per-interval differences in the platform fee (the existing tiered fee applies to both).

## Decisions (resolved during brainstorming)

| Decision | Choice |
| --- | --- |
| Yearly benefits description | Free-text promotional copy, no enforcement |
| Monthly vs yearly coexistence | Member picks; monthly always available, yearly is an optional owner add-on |
| Existing monthly members | Can upgrade to yearly |
| Upgrade payment timing | Immediately, prorated against the card on file |
| Upgrade direction | Monthly → yearly only for now (no downgrade) |
| 3DS / SCA on upgrade | Handled in scope from day one (bank authentication is common on EU cards, so a saved-card upgrade charge frequently needs it) |
| Where yearly pricing lives | Parallel columns on `communities` (Approach A), reusing the single Stripe product |

## 1. Data model

Add four columns to `communities`, reusing the existing `stripe_product_id`:

```sql
ALTER TABLE communities
  ADD COLUMN yearly_enabled         boolean NOT NULL DEFAULT false,
  ADD COLUMN yearly_price           numeric,      -- same type as membership_price
  ADD COLUMN stripe_yearly_price_id text,
  ADD COLUMN yearly_benefits        text;         -- free-text promo copy
```

- Monthly fields (`membership_price`, `stripe_price_id`, `membership_enabled`) are untouched.
- One Stripe Product per community, now with two Prices (monthly + yearly).
- Migration lives in `supabase/migrations/` and must be applied to **both** local Postgres
  databases: `dance_hub` (prod) and `dance_hub_preprod` (preprod).

## 2. Owner config — `SubscriptionsEditor` + `update-price`

A new "Yearly membership" subsection appears under the monthly price block, gated on Stripe
being connected and monthly membership enabled:

- **Enable yearly** toggle.
- **Yearly price** (€/year) input, with a soft, non-enforced hint (e.g. "10x the monthly price
  gives members 2 months free").
- **Yearly benefits** textarea — the teacher's free-text blurb, shown to members at join and on
  the upgrade CTA.

`update-price` is extended to accept `yearlyEnabled`, `yearlyPrice`, `yearlyBenefits`:

- When enabling with a price > 0: ensure the product exists (reuse `stripe_product_id`, create
  it if missing), create a Stripe Price with `recurring: { interval: "year" }`, and store
  `stripe_yearly_price_id`, `yearly_price`, `yearly_enabled`, `yearly_benefits`.
- Changing the yearly price creates a **new** Stripe Price and swaps the stored id (Stripe
  prices are immutable — same pattern the monthly flow already uses).
- When disabling: set `yearly_enabled = false` (keep the columns/price id for reuse).

## 3. Member join flow — plan choice before payment

Because the subscription is created before `PaymentModal` opens, the plan choice slots in first:

- `FeedClient` receives the yearly fields (`yearly_enabled`, `yearly_price`, `yearly_benefits`).
- When yearly is enabled, clicking "Join" shows a **plan selector** first: two cards,
  `€X / month` vs `€Y / year` plus the benefits blurb. Communities without yearly enabled are
  unchanged (straight to payment).
- On selection, `FeedClient` calls `join-paid` with `plan: 'monthly' | 'yearly'`, then opens
  `PaymentModal` with the returned `clientSecret` exactly as today.
- `join-paid` accepts the `plan` param and selects `stripe_yearly_price_id` vs `stripe_price_id`.
  Everything else (Stripe customer, tiered application fee, promo discount, `community_members`
  insert, 100%-off SetupIntent path) is identical.
- `applyPromo` inside `PaymentModal` must also pass the chosen `plan` so re-creating the
  subscription with a discount keeps the yearly price.

## 4. Upgrade flow — monthly → yearly, prorated now

`ManageSubscriptionModal` already knows the member's live `interval`. When it is `month` and the
community has `yearly_enabled`, show a **"Switch to yearly"** CTA with the benefits blurb and a
preview of the charge ("You'll pay €X now, then €Y / year").

New route `POST /api/community/[communitySlug]/subscription/upgrade-yearly`:

- Auth via `getSession`; resolve the member, community, and `stripe_yearly_price_id`.
- Retrieve the subscription and its current item id, then:
  ```ts
  stripe.subscriptions.update(subId, {
    items: [{ id: itemId, price: stripe_yearly_price_id }],
    proration_behavior: 'always_invoice',
  }, { stripeAccount });
  ```
  `always_invoice` immediately creates and attempts to pay a prorated invoice using the saved
  default payment method (saved `on_subscription` at join), off-session.
- The subscription-level `application_fee_percent` carries to the prorated invoice, so the
  platform fee is preserved.
- **Preview:** before confirming, show the exact prorated amount via an upcoming-invoice preview.
- **3DS / SCA handling (required, in scope):** the happy path is a one-click off-session charge
  with no prompt. But on EU cards the bank frequently requires authentication, so this must be
  handled from launch, not deferred. If the off-session charge comes back needing action, return
  the payment intent's `client_secret` and confirm client-side using the `redirect: 'if_required'`
  pattern (project convention for Stripe Elements modals). Only mark the switch complete once the
  charge succeeds; if the member abandons the challenge, the subscription stays monthly and we
  show an honest "we couldn't complete the switch" message rather than a silent no-op.
- The member row does not store the interval (it is read live from Stripe), so the webhook keeps
  status in sync with no extra bookkeeping.

## 5. Webhooks & edge cases

- Yearly subscriptions are ordinary Stripe subscriptions; existing webhook status handling and
  the (client-ignored) Daily-room provisioning do not depend on interval. During implementation,
  grep the Stripe webhook for any hardcoded `"month"` assumptions to confirm.
- Promo codes and yearly compose freely, including the 100%-off SetupIntent path.
- The upgrade proration fires `invoice.paid` on the **same** subscription id — no duplicate
  member creation.

## 6. UI copy conventions

- No em dashes in user-facing strings (use periods/commas).
- No vendor brand names (Stripe / LiveKit / etc.) in user-facing strings — describe the action.
- Teacher-authored benefits text is exempt (it is their content), but our own labels follow the
  rules above.

## 7. Rollout & testing

- Develop on branch **`feat/yearly-membership`** in an isolated git worktree — never build or
  test in the main repo (`/home/debian/apps/dance-hub`), which pm2 serves as prod.
- Apply the migration to `dance_hub_preprod` before deploying.
- Deploy to **preprod.dance-hub.io** with `./deploy-preprod.sh restart feat/yearly-membership`
  (preprod runs from `/home/debian/apps/dance-hub-preprod`, local Postgres `dance_hub_preprod`,
  Stripe TEST mode).
- Test matrix (Stripe TEST cards):
  1. Owner enables yearly (price + benefits) and it appears on the join screen.
  2. New member picks **yearly** and pays successfully.
  3. New member picks **monthly** — unchanged path still works.
  4. Promo code applied to a yearly join.
  5. Existing **monthly** member upgrades to yearly; prorated charge appears immediately.
  6. Upgrade with a 3DS-required test card exercises the confirmation fallback.
- After preprod sign-off, apply the migration to prod `dance_hub` and deploy to prod with
  `./deploy.sh code`.

## Affected files (initial map)

- DB: new migration in `supabase/migrations/`.
- `app/api/community/[communitySlug]/update-price/route.ts` — yearly price create/update.
- `components/admin/SubscriptionsEditor.tsx` — yearly config UI.
- `app/api/community/[communitySlug]/join-paid/route.ts` — `plan` param, price selection.
- `app/[communitySlug]/FeedClient.tsx` — plan selector before payment.
- `components/PaymentModal.tsx` — pass `plan` through `applyPromo`.
- `components/community/ManageSubscriptionModal.tsx` — upgrade CTA + confirmation.
- `app/api/community/[communitySlug]/subscription/upgrade-yearly/route.ts` — new upgrade route.
- `app/api/webhooks/stripe/route.ts` — confirm no interval hardcoding.
