# Membership Promo Codes — Design

**Date:** 2026-07-03
**Status:** Approved shape, pending spec review
**Scope:** Let a community owner create discount codes that new members redeem when joining the community. Membership only (recurring subscription). Private lessons and courses are out of scope for this iteration.

## Goal

A community owner (e.g. Marcela) can create promo codes for her community. A prospective member enters a code on the join screen, sees the discount previewed, and pays the reduced price. The discount and its cost sit entirely on the owner's connected account; the platform's percentage fee scales down with the discounted amount automatically.

## Decisions (locked)

| Dimension | Decision |
|---|---|
| What it discounts | Community membership (the recurring subscription created in `join-paid`) |
| Who redeems | New joiners only. Code entered on the join screen, applied as the subscription is created. Existing members are unaffected. |
| Discount type (per code) | Percentage off, fixed amount off, or free (100% off). Owner chooses per code. |
| Duration (per code) | First payment only (`once`) or for N months (`repeating` + months). Owner chooses per code. |
| Per-code guardrails | Expiry date, max total redemptions, active/paused toggle. (No per-customer limit — a joiner joins once. No minimum spend — membership is a single fixed price.) |
| Source of truth | Stripe, on the connected account. A thin `community_promo_codes` table mirrors config and links codes to communities. Stripe enforces redemptions/expiry. |

## Why this is feasible without a discount engine

Every membership is a **subscription created directly on the owner's connected account** (`join-paid/route.ts`, `stripe.subscriptions.create(..., { stripeAccount })`) with `application_fee_percent`. Stripe subscriptions natively accept coupons and promotion codes, so Stripe handles validation, redemption counting, expiry, and per-code limits. We do not compute or track discounts ourselves.

Because these are direct charges, the Coupon and Promotion Code must be created **on the connected account**, not the platform account. This is the desired outcome: the discount reduces the owner's revenue (it is her promo), and since the platform fee is a percentage of the (post-discount) amount, the platform's cut scales down proportionally with no fee-logic changes.

## Architecture

### Stripe objects (per code, on the connected account)

Creating one promo code produces two Stripe objects on `community.stripe_account_id`:

1. **Coupon** — the discount shape only:
   - `percent_off` (percentage / free=100), or `amount_off` + `currency` (fixed).
   - `duration: 'once' | 'repeating'`, plus `duration_in_months` when repeating.
2. **Promotion Code** — the customer-facing string and limits:
   - `code` (the string a member types), `coupon` (the id above),
   - `expires_at` (optional), `max_redemptions` (optional), `active`.

`amount_off` coupons must use the community's membership currency, resolved from the community's membership price at creation time.

### Data model

New table `community_promo_codes` (all scalar columns, no jsonb):

| Column | Notes |
|---|---|
| `id` | uuid pk |
| `community_id` | fk → communities |
| `code` | customer-facing string, unique per community |
| `stripe_coupon_id` | coupon on connected account |
| `stripe_promotion_code_id` | promotion code on connected account |
| `discount_type` | `'percent' \| 'amount'` (free = percent with value 100) |
| `discount_value` | numeric (percent, or amount in major units) |
| `duration` | `'once' \| 'repeating'` |
| `duration_in_months` | int, null unless repeating |
| `max_redemptions` | int, nullable |
| `expires_at` | timestamptz, nullable |
| `active` | boolean, default true |
| `created_by` | user id |
| `created_at` | timestamptz default now() |

Redemption counts are **not** stored; they are read live from Stripe (`times_redeemed` on the promotion code) when rendering the admin list, so they never drift.

### API routes

Owner-only routes gated by the existing `community.created_by` ownership check.

- `POST /api/community/[communitySlug]/promo-codes` — create. Resolves membership currency, creates coupon + promotion code on the connected account, inserts the mirror row. Validates: code non-empty and unique per community, discount value in range (1–100 for percent, > 0 for amount), duration_in_months present when repeating.
- `GET /api/community/[communitySlug]/promo-codes` — list codes for the community, enriched with live `times_redeemed` from Stripe.
- `PATCH /api/community/[communitySlug]/promo-codes/[id]` — activate / deactivate (flips promotion code `active` on Stripe and the mirror row).
- `DELETE /api/community/[communitySlug]/promo-codes/[id]` — deactivate + soft-hide. (Stripe promotion codes cannot be hard-deleted; deactivation is the real operation. Existing discounted members are unaffected.)
- `POST /api/community/[communitySlug]/promo-codes/validate` — **public** (used on the join screen). Input: code string. Looks up the active promotion code on the connected account (`promotionCodes.list({ code, active: true }, { stripeAccount })`), checks expiry and remaining redemptions, and returns either `{ valid: false, reason }` or `{ valid: true, promotionCodeId, preview }` where `preview` describes the discount for display. Returns a generic invalid result for unknown/inactive/expired/maxed codes (no enumeration of which reason leaks code existence). Rate-limited to discourage brute-forcing.

### `join-paid` change

`join-paid/route.ts` accepts an optional resolved `promotionCodeId`. When present, it attaches the discount to the subscription:

```
discounts: [{ promotion_code: promotionCodeId }]
```

Everything else stays the same: `application_fee_percent` still applies to the post-discount amount. If the promotion code is invalid at attach time (race with deactivation/expiry), Stripe rejects it; we surface a clean "code no longer valid" error and let the member retry without a code.

### Teacher UI (community admin)

A "Promo codes" section in the community admin area:

- **List:** code, discount (e.g. "20% off" / "€10 off" / "Free"), duration ("first payment" / "3 months"), redemptions (used / limit), expiry, status (active/paused). Actions: pause/resume, delete.
- **Create form:** code string (with an optional "generate" helper), discount type (percentage / fixed amount / free) + value, duration (first payment only / for N months + months input), optional expiry date, optional max redemptions.

### Member UI (join screen)

An optional "Have a promo code?" field on the paid-join screen. On apply, it calls the validate endpoint and shows the resolved discount inline (e.g. "20% off for 3 months") or an inline invalid message. The resolved `promotionCodeId` is passed into `join-paid` when the member subscribes.

UI copy follows project conventions: no vendor/processor brand names in user-facing strings, and no em dashes.

## Edge cases

1. **Free / 100%-off first invoice (the one non-trivial case).** When the first invoice is €0 (100% off `once`, or 100% off `repeating` while active), Stripe creates no PaymentIntent for the first cycle, so the current `confirmation_secret` path yields nothing to confirm. The join flow must branch: when no payment is due, still collect and save a payment method (via a SetupIntent) so full-price renewals can charge later, and activate the membership without a card charge. The implementation plan must cover both branches (payment due / no payment due).
2. **Fixed amount off ≥ membership price.** Stripe floors the invoice at €0; treated as case 1 for that invoice.
3. **Currency mismatch.** `amount_off` coupons are created with the community's membership currency; creation resolves it from the membership price so the coupon currency always matches the subscription.
4. **Platform fee.** `application_fee_percent` on the discounted amount means the platform automatically earns less on discounted joins. Expected and acceptable.
5. **Deactivation semantics.** Pausing/deleting a code stops new redemptions but never alters or refunds existing members' discounts.
6. **Code uniqueness.** Enforced per community in our table and by Stripe (active promotion code strings are unique per connected account).

## Testing

- Unit: create-code input validation (percent range, amount > 0, repeating requires months, unique code per community, currency resolution).
- Unit: validate endpoint returns generic invalid for unknown/inactive/expired/maxed; returns preview for valid.
- Integration (Stripe test mode on a connected account): create coupon + promotion code; attach to a subscription via `join-paid`; assert discounted invoice amount and reduced application fee.
- Integration: 100%-off first invoice path — assert membership activates, a payment method is saved, and a later full-price renewal can charge.
- Integration: deactivate a code — new redemption blocked, existing member's discount intact.

## Out of scope (possible follow-ups)

- Promo codes for private lessons (would require a custom discount path, since PaymentIntents don't accept coupons).
- Discounting existing members' live subscriptions.
- Per-customer redemption limits, minimum-spend rules, product-restricted codes.
- Forever-duration discounts.
