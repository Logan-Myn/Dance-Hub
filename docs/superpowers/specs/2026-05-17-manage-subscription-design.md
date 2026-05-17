# Manage Subscription — Design

**Date:** 2026-05-17
**Status:** Approved for implementation planning
**Scope:** v1 — let community members view their subscription and update the payment method on file

## Problem

A community member (student) currently has no way to update the card on their active subscription. The teacher hears about it, asks the platform, and the only workaround today is to cancel + rejoin. The student-reported case driving this work was a teacher whose student needed to swap cards.

## Goals (v1)

- Let an active or past_due member open a "Manage" surface from the community sidebar.
- See plan (price, interval), next billing date, current card on file, and recent payment history.
- Update the card on file without leaving dance-hub.io.
- For `past_due` members, retry the failing invoice immediately after a successful card update.

## Non-goals (v1)

- Plan changes (price/interval swaps).
- Cancellation from inside Manage — the existing "Leave Community" flow stays as the cancel path.
- Pause / resume.
- Invoice download UI beyond the hosted invoice link Stripe already provides.
- Free/inactive/canceled member states — Manage is not shown to them.

## UI

### Sidebar button

In `components/community/CommunitySidebar.tsx`, when `isMember && subscription_status ∈ {active, past_due}`, render a **Manage** button directly above the existing **Leave Community** button. Same width, neutral (non-destructive) styling.

The button is hidden when:
- The community has no subscription (free community), or
- The member's `subscription_status` is anything other than `active` or `past_due`.

### Modal layout

New component: `components/community/ManageSubscriptionModal.tsx`.

Default view:

```
┌───────────────────────────────────────┐
│ Manage subscription              [x]  │
├───────────────────────────────────────┤
│ Plan                                  │
│ Monthly · €25.00                      │
│ Next charge: 15 June 2026             │
│ [If past_due: amber banner]           │
│                                       │
│ Payment method                        │
│ Visa •••• 4242    [Update]            │
│                                       │
│ Recent payments                       │
│ ✓ 15 May 2026   €25.00   Receipt ↗   │
│ ✓ 15 Apr 2026   €25.00   Receipt ↗   │
│ ✓ 15 Mar 2026   €25.00   Receipt ↗   │
└───────────────────────────────────────┘
```

Clicking **Update** swaps the modal body to a PaymentElement (driven by a SetupIntent client_secret), with `[Save]` and `[Cancel]` actions. After a successful save, the modal returns to the default view with the new card displayed.

### Copy rules

- No vendor brand names in user-facing strings (no "Stripe", no "Visa" branding beyond the card brand string Stripe returns for display).
- No em dashes in UI copy.
- After a `past_due` card update where the immediate retry fails: "Card updated. We'll retry the pending charge automatically."

## API surface

All routes live under `app/api/community/[communitySlug]/subscription/`.

Every route:
- Resolves the session via `getSession()` and rejects unauthenticated requests.
- Looks up the caller's `community_members` row for `[communitySlug]` and rejects if no row exists or `stripe_subscription_id` is null.
- Calls Stripe with `{ stripeAccount: community.stripe_account_id }` on every call (subscriptions live on the connected account, matching `join-paid`).

### `GET /api/community/[communitySlug]/subscription`

Returns plan summary for the calling member's subscription:

```ts
{
  status: 'active' | 'past_due' | 'canceled' | ...,
  currency: string,
  amount: number,            // minor units
  interval: 'month' | 'year' | ...,
  currentPeriodEnd: number,  // unix seconds
  defaultPaymentMethod: {
    brand: string,           // 'visa', 'mastercard', ...
    last4: string,
  } | null,
}
```

### `GET /api/community/[communitySlug]/subscription/payments`

Returns the last 5 paid invoices for the subscription:

```ts
{
  invoices: Array<{
    id: string,
    paidAt: number,          // unix seconds
    amount: number,          // minor units
    currency: string,
    hostedInvoiceUrl: string | null,
  }>
}
```

Implementation: `stripe.invoices.list({ subscription, status: 'paid', limit: 5 }, { stripeAccount })`.

### `POST /api/community/[communitySlug]/subscription/setup-intent`

Creates a SetupIntent scoped to the member's existing customer, returns the client_secret for the PaymentElement:

```ts
{ clientSecret: string }
```

Implementation: `stripe.setupIntents.create({ customer, payment_method_types: ['card'], usage: 'off_session' }, { stripeAccount })`.

### `POST /api/community/[communitySlug]/subscription/payment-method`

Body: `{ paymentMethodId: string }`.

Performs the card swap and conditional retry, in this exact order:

```
1. paymentMethods.attach(pmId, { customer })   // safe: idempotent if already attached
2. subscriptions.update(subId, {
     default_payment_method: pmId
   })
3. customers.update(custId, {
     invoice_settings: { default_payment_method: pmId }
   })
4. Re-fetch subscription (fresh state, do NOT trust the value from step 2)
5. Decide retry based on fresh state:
   - status === 'active'    → return { ok: true, retried: false }. No charge attempted.
   - status === 'past_due'  → fetch latest_invoice
       - if invoice.status === 'open' → invoices.pay(invoiceId)
           - success → return { ok: true, retried: true }
           - failure → return { ok: true, retried: false, retryError: '...' }
       - else → return { ok: true, retried: false }
   - any other status       → return { ok: true, retried: false }
```

Three guards prevent unwanted charges:

1. **Status gate** — only `past_due` ever triggers `invoices.pay()`. `active` never does.
2. **Invoice-status gate** — only retry if the latest invoice is still `open`. Catches the race where Stripe already retried successfully.
3. **Re-fetch before deciding** — read fresh subscription state after the update, not the value the client opened the modal with.

Both conditions (`past_due` AND `open` invoice) must hold for any charge to fire.

## Data flow & database

**No new tables. No DB writes.**

Stripe is the source of truth for default payment method, invoices, and subscription state. We already store `stripe_customer_id` and `stripe_subscription_id` on `community_members`, which is all the scoping we need.

The modal fetches everything live from Stripe on open; there is no cached card-brand/last4 to keep in sync.

## Edge cases

- **3DS / authentication required on card update** — SetupIntent confirms via PaymentElement using the existing `redirect: 'if_required'` + polling pattern from `join-paid`. No special handling needed beyond mirroring that pattern.
- **PM attach fails** (declined card, expired, etc.) — return Stripe's error message to the modal. Old card remains the default. No partial state.
- **Concurrent renewal during card swap** — narrow window. If Stripe renews against the old card mid-flow, the new card takes effect next cycle. Accepted.
- **Subscription canceled mid-modal** — `GET /subscription` returns the current status; modal renders "This subscription is no longer active" and disables Update.
- **Past_due retry fails after card swap** — return `retried: false` + `retryError`. UI shows "Card updated. We'll retry the pending charge automatically." Stripe's dunning continues.
- **No card on file yet** (subscription created but never paid) — defaultPaymentMethod is `null`, the modal shows "No card on file" with a primary Update button instead of the secondary one.

## Files touched

```
components/community/CommunitySidebar.tsx                                  (add Manage button + handler prop)
components/community/ManageSubscriptionModal.tsx                           (new)
app/[communitySlug]/FeedClient.tsx                                         (wire modal open/close state)
app/api/community/[communitySlug]/subscription/route.ts                    (new GET)
app/api/community/[communitySlug]/subscription/payments/route.ts           (new GET)
app/api/community/[communitySlug]/subscription/setup-intent/route.ts       (new POST)
app/api/community/[communitySlug]/subscription/payment-method/route.ts     (new POST)
```

## Testing

- Manual: active subscription card swap, past_due card swap with successful immediate retry, past_due card swap where retry fails, canceled-mid-modal, 3DS-required card (Stripe test card `4000002500003155`).
- Run on preprod Stripe test mode against a real Connect account.
- Verify with `stripe.subscriptions.retrieve` after each swap that `default_payment_method` is updated and the customer's `invoice_settings.default_payment_method` matches.

## Open questions deferred to implementation

- Branch strategy: continue on `fix/final-dev-batch` (current preprod branch) or spin a new feature branch off it. Decide at first commit.
