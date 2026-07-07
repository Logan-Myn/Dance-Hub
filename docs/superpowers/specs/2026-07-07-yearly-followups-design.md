# Yearly membership follow-ups: plan-aware join CTA + per-plan promo codes

**Date:** 2026-07-07
**Status:** Approved design
**Context:** Follow-ups to the shipped yearly-membership feature (see `2026-07-06-yearly-membership-design.md`). Two independent, small changes bundled into one branch (`feat/yearly-followups`).

## Problem

1. **Join CTA shows a monthly-only price when a yearly plan exists.** The Hero/CTA join buttons on the community About page render `Join for €X/month` from the monthly membership price. When an owner has also enabled a yearly plan, this is misleading: clicking the button opens a plan chooser offering both monthly and yearly, but the button implies monthly is the only option. The label helper never receives the yearly fields.

2. **Promo codes cannot be scoped to a plan.** Owner promo codes currently apply to whichever plan a member subscribes to (the coupon attaches to the subscription regardless of price). Owners want to offer a code that applies to only the monthly plan, only the yearly plan, or both (e.g. a yearly-only launch discount).

## Key constraint

Monthly and yearly membership reuse the **same Stripe product** (two Prices on one product — Approach A from the yearly design). Stripe coupons can only be restricted by *product*, not by price, so Stripe cannot natively enforce "this coupon applies to yearly but not monthly." **Per-plan scoping is therefore enforced in our own application logic**, not by Stripe.

This is safe because the promo-code entry lives *inside* the plan-aware checkout (`PaymentModalBody`), which already knows the chosen plan when a code is applied. We gate at validation time.

## Part 1 — Plan-aware join CTA

### Behavior

`getJoinButtonLabel(data, { isEditing })` in `lib/page-builder.ts` gains the yearly fields:

| State | Label |
|---|---|
| Already a member (not editing) | `You're already a member` (unchanged) |
| Community inactive | `Community Inactive` (unchanged) |
| Pre-registration, paid | `Pre-Register for €X/month` (unchanged — monthly deposit flow) |
| Pre-registration, free | `Pre-Register for free` (unchanged) |
| Active, free | `Join for free` (unchanged) |
| Active, paid, **monthly only** | `Join for €X/month` (unchanged) |
| Active, paid, **yearly enabled** | `Join community` (new — no price; chooser shows both) |

"Yearly enabled" means `yearlyEnabled === true && (yearlyPrice ?? 0) > 0`, mirroring the join-flow condition in `useJoinCommunity`.

### Wiring

- Extend the helper's `JoinButtonLabelData` interface with `yearlyEnabled?: boolean` and `yearlyPrice?: number`.
- `HeroSection` and `CTASection` already receive `communityData: JoinCommunityData` (which carries `yearlyEnabled`/`yearlyPrice`) and already call `getJoinButtonLabel(communityData, { isEditing })`. Passing the existing object is sufficient — no new props threaded, no component-structure changes.

## Part 2 — Promo codes scoped to a plan

### Data model

Add one column to `community_promo_codes`:

```sql
ALTER TABLE community_promo_codes
  ADD COLUMN IF NOT EXISTS applies_to_plan TEXT NOT NULL DEFAULT 'both';
```

Values: `'monthly' | 'yearly' | 'both'`. Existing rows default to `'both'` — no behavior change for codes created before this feature.

Types (`lib/promo-codes/types.ts`):
- `AppliesToPlan = 'monthly' | 'yearly' | 'both'`.
- Add `appliesToPlan: AppliesToPlan` to `CreatePromoCodeInput` and `PromoCodeRecord`.
- `PromoCodeRow` (service) gains `applies_to_plan`.

### Creation

- `createPromoCode` persists `applies_to_plan` from the validated input. No Stripe-side change (the coupon/promotion code are created exactly as today; scoping is our metadata only).
- Input validation: `appliesToPlan` must be one of the three literals; default to `'both'` if omitted (defensive — the API/UI always sends it).

### Owner UI (`PromoCodesManager`)

- Create form gains a **scope selector** with three choices: **Monthly only / Yearly only / Both plans** (default: Both plans).
- The selector is shown **only when the community has yearly enabled**. When yearly is disabled, the field is hidden and the code is created with `appliesToPlan: 'both'` (only monthly exists, so scope is moot). This requires the manager to know whether yearly is enabled — pass a `yearlyEnabled` prop down from the promo-codes admin page (which already loads the community).
- The promo list shows a small badge for scoped codes: "Yearly only" / "Monthly only". `'both'` shows no badge (or "All plans").
- Scope is set at creation only. Consistent with today's codes, which support create / activate / deactivate / delete but not edit.

### Validation gate

- The checkout (`PaymentModalBody.applyPromo`) already knows `plan`. It sends `plan` in the body of `POST /promo-codes/validate` alongside `code`.
- The validate route loads the community `id` (already loads the row by slug) and passes `{ stripeAccountId, communityId, code, plan }` to the service.
- `validatePromoCode` gains `communityId` and `plan` parameters. After the existing Stripe checks pass, it loads the mirror row (`community_promo_codes` by `community_id` + case-insensitive `code`) to read `applies_to_plan`:
  - If the row is missing, fall back to `'both'` (treat as unrestricted — a code that exists in Stripe but not our mirror should not be *more* restricted).
  - If `applies_to_plan` is `'both'`, or equals the requested `plan`, continue as today.
  - Otherwise return `{ valid: false, reason }` where reason is plan-specific: *"This code only applies to the yearly plan."* / *"This code only applies to the monthly plan."*
- Non-existent / inactive / expired codes still return the generic `"That code is not valid."` — no information leak about which codes exist.
- `plan` is optional in the service signature and defaults to `'monthly'` for any caller that does not pass it (backward-safe), but the checkout always passes the real plan.

### Apply path

Unchanged. `join-paid` receives `promotionCodeId` + `plan` and attaches the coupon to the subscription it creates for that plan. The coupon discounts whatever price the subscription uses. No Stripe API changes.

## Out of scope (YAGNI)

- Editing an existing code's scope (or any other field) — codes remain create/activate/deactivate/delete.
- Restricting *which* codes a member can see before choosing a plan — members only learn a code doesn't apply when they try to apply it on the wrong plan.
- Any change to discount math, coupon duration, redemption limits, or the Stripe coupon shape.
- Per-plan *different* discounts from a single code (a code has one discount; scope only gates applicability).

## Testing

- **CTA:** unit tests for `getJoinButtonLabel` covering monthly-only (price shown), yearly-enabled (generic "Join community"), free, pre-registration, member, and inactive states.
- **Promo scope — service:** `validatePromoCode` returns valid when scope matches or is `'both'`; returns the plan-specific reason when scope mismatches; missing mirror row falls back to `'both'`.
- **Promo scope — creation:** `createPromoCode` persists `applies_to_plan`; input validation rejects a bad value.
- **Owner UI:** the scope selector renders only when `yearlyEnabled`; list renders the scope badge.
- Regression: existing promo-code tests and the yearly-membership tests still pass.

## Rollout

1. Apply the migration to preprod DB, validate on `preprod.dance-hub.io`.
2. After sign-off: apply the migration to prod `dance_hub`, merge to `main`, `./deploy.sh code`, verify the fresh build serves (watch the pm2 orphan footgun).
