# Manage Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let active and past_due community members view their subscription details and swap their card on file from inside dance-hub.io, without needing to cancel and rejoin.

**Architecture:** Four new Next.js App Router API routes under `app/api/community/[communitySlug]/subscription/` operate on the connected account's customer + subscription. A new `ManageSubscriptionModal.tsx` shows plan/next-charge/recent payments and reuses the existing PaymentElement + SetupIntent pattern from `PreRegistrationPaymentModal.tsx` for card collection. Charge retry on `past_due` is guarded by three independent checks (status gate, invoice-status gate, post-update re-fetch).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, `@stripe/stripe-js` + `@stripe/react-stripe-js`, `better-auth` (`getSession()` from `lib/auth-session`), Neon Postgres via `lib/db.ts`, shadcn/ui Dialog primitives, `react-hot-toast`.

**Spec:** `docs/superpowers/specs/2026-05-17-manage-subscription-design.md`

**Working branch:** `feat/manage-subscription` (off `fix/final-dev-batch`) in worktree `/home/debian/apps/dance-hub-preprod`.

---

## Testing reality check

The Stripe-touching API routes in this codebase (`join-paid`, `leave`, `reactivate`) have **no automated tests** — they're validated manually against preprod test-mode Stripe. This plan follows that convention: lightweight component tests for the modal, manual test runs for the API routes. Don't invent mocks that the rest of the codebase doesn't use.

If you want to add automated coverage later, do it as a separate refactor. Not in scope here.

---

## File structure

**New files:**

- `app/api/community/[communitySlug]/subscription/route.ts` — GET subscription summary
- `app/api/community/[communitySlug]/subscription/payments/route.ts` — GET last 5 paid invoices
- `app/api/community/[communitySlug]/subscription/setup-intent/route.ts` — POST create SetupIntent
- `app/api/community/[communitySlug]/subscription/payment-method/route.ts` — POST swap default PM + guarded retry
- `components/community/ManageSubscriptionModal.tsx` — modal with details + update-card view
- `__tests__/components/ManageSubscriptionModal.test.tsx` — render-state tests

**Modified files:**

- `components/community/CommunitySidebar.tsx` — add Manage button, new `onManageClick` prop, new `subscriptionStatus` prop
- `app/[communitySlug]/FeedClient.tsx` — wire modal open/close, pass `onManageClick` + `subscriptionStatus` to sidebar

**Shared helpers (inline in each route, do not extract early):** Each route resolves the caller's member row identically. After all four routes exist, if duplication feels heavy, extract `lib/community-subscription-auth.ts` in a follow-up — but YAGNI until then.

---

## Task 1: GET /subscription — return plan summary

**Files:**
- Create: `app/api/community/[communitySlug]/subscription/route.ts`

- [ ] **Step 1.1: Create the route file**

Create `app/api/community/[communitySlug]/subscription/route.ts`:

```ts
import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { getSession } from "@/lib/auth-session";
import type Stripe from "stripe";

interface Community {
  id: string;
  stripe_account_id: string | null;
}

interface Member {
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
}

export async function GET(
  _request: Request,
  props: { params: Promise<{ communitySlug: string }> }
) {
  const params = await props.params;
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const community = await queryOne<Community>`
    SELECT id, stripe_account_id
    FROM communities
    WHERE slug = ${params.communitySlug}
  `;
  if (!community?.stripe_account_id) {
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }

  const member = await queryOne<Member>`
    SELECT stripe_subscription_id, stripe_customer_id
    FROM community_members
    WHERE community_id = ${community.id} AND user_id = ${userId}
  `;
  if (!member?.stripe_subscription_id) {
    return NextResponse.json(
      { error: "No subscription found" },
      { status: 404 }
    );
  }

  try {
    const sub = await stripe.subscriptions.retrieve(
      member.stripe_subscription_id,
      {
        expand: ["default_payment_method", "items.data.price"],
      },
      { stripeAccount: community.stripe_account_id }
    );

    const price = sub.items.data[0]?.price;
    const pm = sub.default_payment_method as Stripe.PaymentMethod | null;
    const card = pm?.type === "card" ? pm.card : null;

    return NextResponse.json({
      status: sub.status,
      currency: price?.currency ?? "eur",
      amount: price?.unit_amount ?? 0,
      interval: price?.recurring?.interval ?? "month",
      currentPeriodEnd: (sub as any).current_period_end as number,
      defaultPaymentMethod: card
        ? { brand: card.brand, last4: card.last4 }
        : null,
    });
  } catch (err) {
    console.error("Failed to load subscription:", err);
    return NextResponse.json(
      { error: "Failed to load subscription" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 1.2: Type-check**

Run: `bun run build` (or `bunx tsc --noEmit` if available)
Expected: no new TypeScript errors. If `current_period_end` errors, the `(sub as any)` cast already accounts for Stripe SDK type drift — leave it.

- [ ] **Step 1.3: Commit**

```bash
git add app/api/community/\[communitySlug\]/subscription/route.ts
git commit -m "feat(manage-subscription): GET subscription summary route"
```

---

## Task 2: GET /subscription/payments — return last 5 paid invoices

**Files:**
- Create: `app/api/community/[communitySlug]/subscription/payments/route.ts`

- [ ] **Step 2.1: Create the route file**

Create `app/api/community/[communitySlug]/subscription/payments/route.ts`:

```ts
import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { getSession } from "@/lib/auth-session";

interface Community {
  id: string;
  stripe_account_id: string | null;
}

interface Member {
  stripe_subscription_id: string | null;
}

export async function GET(
  _request: Request,
  props: { params: Promise<{ communitySlug: string }> }
) {
  const params = await props.params;
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const community = await queryOne<Community>`
    SELECT id, stripe_account_id
    FROM communities
    WHERE slug = ${params.communitySlug}
  `;
  if (!community?.stripe_account_id) {
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }

  const member = await queryOne<Member>`
    SELECT stripe_subscription_id
    FROM community_members
    WHERE community_id = ${community.id} AND user_id = ${userId}
  `;
  if (!member?.stripe_subscription_id) {
    return NextResponse.json(
      { error: "No subscription found" },
      { status: 404 }
    );
  }

  try {
    const list = await stripe.invoices.list(
      {
        subscription: member.stripe_subscription_id,
        status: "paid",
        limit: 5,
      },
      { stripeAccount: community.stripe_account_id }
    );

    return NextResponse.json({
      invoices: list.data.map((inv) => ({
        id: inv.id,
        paidAt: (inv.status_transitions?.paid_at ?? inv.created) as number,
        amount: inv.amount_paid,
        currency: inv.currency,
        hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
      })),
    });
  } catch (err) {
    console.error("Failed to load invoices:", err);
    return NextResponse.json(
      { error: "Failed to load payments" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2.2: Type-check**

Run: `bun run build`
Expected: no new TypeScript errors.

- [ ] **Step 2.3: Commit**

```bash
git add app/api/community/\[communitySlug\]/subscription/payments/route.ts
git commit -m "feat(manage-subscription): GET recent paid invoices route"
```

---

## Task 3: POST /subscription/setup-intent — create SetupIntent for card update

**Files:**
- Create: `app/api/community/[communitySlug]/subscription/setup-intent/route.ts`

- [ ] **Step 3.1: Create the route file**

Create `app/api/community/[communitySlug]/subscription/setup-intent/route.ts`:

```ts
import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { getSession } from "@/lib/auth-session";

interface Community {
  id: string;
  stripe_account_id: string | null;
}

interface Member {
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
}

export async function POST(
  _request: Request,
  props: { params: Promise<{ communitySlug: string }> }
) {
  const params = await props.params;
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const community = await queryOne<Community>`
    SELECT id, stripe_account_id
    FROM communities
    WHERE slug = ${params.communitySlug}
  `;
  if (!community?.stripe_account_id) {
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }

  const member = await queryOne<Member>`
    SELECT stripe_subscription_id, stripe_customer_id
    FROM community_members
    WHERE community_id = ${community.id} AND user_id = ${userId}
  `;
  if (!member?.stripe_subscription_id || !member.stripe_customer_id) {
    return NextResponse.json(
      { error: "No subscription found" },
      { status: 404 }
    );
  }

  try {
    const setupIntent = await stripe.setupIntents.create(
      {
        customer: member.stripe_customer_id,
        payment_method_types: ["card"],
        usage: "off_session",
      },
      { stripeAccount: community.stripe_account_id }
    );

    return NextResponse.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    console.error("Failed to create setup intent:", err);
    return NextResponse.json(
      { error: "Failed to start card update" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3.2: Type-check**

Run: `bun run build`
Expected: no new TypeScript errors.

- [ ] **Step 3.3: Commit**

```bash
git add app/api/community/\[communitySlug\]/subscription/setup-intent/route.ts
git commit -m "feat(manage-subscription): POST SetupIntent route"
```

---

## Task 4: POST /subscription/payment-method — swap card with guarded retry

This is the most sensitive route. Read the three-guard logic in the spec (§ API surface → `POST /payment-method`) before implementing.

**Files:**
- Create: `app/api/community/[communitySlug]/subscription/payment-method/route.ts`

- [ ] **Step 4.1: Create the route file**

Create `app/api/community/[communitySlug]/subscription/payment-method/route.ts`:

```ts
import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { getSession } from "@/lib/auth-session";
import type Stripe from "stripe";

interface Community {
  id: string;
  stripe_account_id: string | null;
}

interface Member {
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
}

export async function POST(
  request: Request,
  props: { params: Promise<{ communitySlug: string }> }
) {
  const params = await props.params;
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await request.json().catch(() => ({}));
  const paymentMethodId =
    typeof body.paymentMethodId === "string" ? body.paymentMethodId : null;
  if (!paymentMethodId) {
    return NextResponse.json(
      { error: "paymentMethodId required" },
      { status: 400 }
    );
  }

  const community = await queryOne<Community>`
    SELECT id, stripe_account_id
    FROM communities
    WHERE slug = ${params.communitySlug}
  `;
  if (!community?.stripe_account_id) {
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }
  const stripeAccount = community.stripe_account_id;

  const member = await queryOne<Member>`
    SELECT stripe_subscription_id, stripe_customer_id
    FROM community_members
    WHERE community_id = ${community.id} AND user_id = ${userId}
  `;
  if (!member?.stripe_subscription_id || !member.stripe_customer_id) {
    return NextResponse.json(
      { error: "No subscription found" },
      { status: 404 }
    );
  }
  const subscriptionId = member.stripe_subscription_id;
  const customerId = member.stripe_customer_id;

  try {
    // 1. Attach PM (idempotent: throws if already attached to *another* customer,
    //    but Stripe is happy re-attaching to the same one).
    try {
      await stripe.paymentMethods.attach(
        paymentMethodId,
        { customer: customerId },
        { stripeAccount }
      );
    } catch (attachErr: any) {
      // Already attached to this customer is fine. Any other error bubbles.
      const code = attachErr?.raw?.code ?? attachErr?.code;
      if (code !== "payment_method_already_attached") {
        throw attachErr;
      }
    }

    // 2. Make it the subscription default.
    await stripe.subscriptions.update(
      subscriptionId,
      { default_payment_method: paymentMethodId },
      { stripeAccount }
    );

    // 3. Make it the customer default for invoice settings (future renewals).
    await stripe.customers.update(
      customerId,
      { invoice_settings: { default_payment_method: paymentMethodId } },
      { stripeAccount }
    );

    // 4. Re-fetch FRESH state. Do not trust step-2's return value.
    const fresh = await stripe.subscriptions.retrieve(
      subscriptionId,
      { expand: ["latest_invoice"] },
      { stripeAccount }
    );

    // 5. Guarded retry — only past_due + open invoice triggers a charge.
    if (fresh.status !== "past_due") {
      return NextResponse.json({ ok: true, retried: false });
    }

    const latest = fresh.latest_invoice as Stripe.Invoice | null;
    if (!latest || latest.status !== "open") {
      return NextResponse.json({ ok: true, retried: false });
    }

    try {
      await stripe.invoices.pay(latest.id!, undefined, { stripeAccount });
      return NextResponse.json({ ok: true, retried: true });
    } catch (payErr: any) {
      console.error("Invoice retry failed after card update:", payErr);
      return NextResponse.json({
        ok: true,
        retried: false,
        retryError: payErr?.message ?? "Retry failed",
      });
    }
  } catch (err: any) {
    console.error("Failed to update payment method:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to update payment method" },
      { status: 400 }
    );
  }
}
```

**Why the structure matters:**

- The `try` around `paymentMethods.attach` swallows only the `payment_method_already_attached` code — every other Stripe error bubbles to the outer catch and the card swap is rejected. Don't change this to swallow all attach errors.
- Steps 2 → 3 → 4 → 5 are sequential because each depends on the previous. Do not `Promise.all` them.
- The `fresh.status !== 'past_due'` early-return is the **status gate**. The `latest.status !== 'open'` early-return is the **invoice-status gate**. Both must hold for `invoices.pay` to fire. If you "simplify" by combining or skipping a guard, you have introduced an unwanted-charge bug.

- [ ] **Step 4.2: Type-check**

Run: `bun run build`
Expected: no new TypeScript errors.

- [ ] **Step 4.3: Commit**

```bash
git add app/api/community/\[communitySlug\]/subscription/payment-method/route.ts
git commit -m "feat(manage-subscription): POST card swap with guarded retry"
```

---

## Task 5: ManageSubscriptionModal — default details view

**Files:**
- Create: `components/community/ManageSubscriptionModal.tsx`

- [ ] **Step 5.1: Create the modal component (details view only, no update flow yet)**

Create `components/community/ManageSubscriptionModal.tsx`:

```tsx
"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle } from "lucide-react";

type Status = "active" | "past_due" | "canceled" | "incomplete" | string;

interface SubscriptionSummary {
  status: Status;
  currency: string;
  amount: number;
  interval: string;
  currentPeriodEnd: number;
  defaultPaymentMethod: { brand: string; last4: string } | null;
}

interface Payment {
  id: string;
  paidAt: number;
  amount: number;
  currency: string;
  hostedInvoiceUrl: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  communitySlug: string;
}

const formatMoney = (minor: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(minor / 100);

const formatDate = (unixSec: number) =>
  new Date(unixSec * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const intervalLabel = (interval: string) =>
  interval === "month" ? "Monthly" : interval === "year" ? "Yearly" : interval;

const brandLabel = (brand: string) =>
  brand.charAt(0).toUpperCase() + brand.slice(1);

export function ManageSubscriptionModal({
  isOpen,
  onClose,
  communitySlug,
}: Props) {
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/community/${communitySlug}/subscription`).then((r) =>
        r.ok ? r.json() : Promise.reject(r)
      ),
      fetch(`/api/community/${communitySlug}/subscription/payments`).then((r) =>
        r.ok ? r.json() : Promise.reject(r)
      ),
    ])
      .then(([s, p]) => {
        if (cancelled) return;
        setSummary(s);
        setPayments(p.invoices ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Could not load subscription details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, communitySlug]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage subscription</DialogTitle>
          <DialogDescription>
            View your plan and update the card on file.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-destructive py-4">{error}</p>
        )}

        {!loading && summary && (
          <div className="space-y-6 py-2">
            <section>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                Plan
              </h3>
              <p className="text-sm">
                {intervalLabel(summary.interval)} ·{" "}
                {formatMoney(summary.amount, summary.currency)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Next charge: {formatDate(summary.currentPeriodEnd)}
              </p>

              {summary.status === "past_due" && (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>
                    Your last payment did not go through. Update your card to
                    fix it.
                  </p>
                </div>
              )}
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                Payment method
              </h3>
              <div className="flex items-center justify-between rounded-md border p-3">
                <p className="text-sm">
                  {summary.defaultPaymentMethod
                    ? `${brandLabel(summary.defaultPaymentMethod.brand)} •••• ${summary.defaultPaymentMethod.last4}`
                    : "No card on file"}
                </p>
                <Button
                  variant={summary.defaultPaymentMethod ? "outline" : "default"}
                  size="sm"
                  disabled
                  title="Card update coming in next task"
                >
                  Update
                </Button>
              </div>
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                Recent payments
              </h3>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No payments yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {payments.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span>
                        {formatDate(p.paidAt)} ·{" "}
                        {formatMoney(p.amount, p.currency)}
                      </span>
                      {p.hostedInvoiceUrl && (
                        <a
                          href={p.hostedInvoiceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline text-xs"
                        >
                          Receipt
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

The Update button is disabled in this task. It gets wired in Task 6.

- [ ] **Step 5.2: Type-check**

Run: `bun run build`
Expected: no new TypeScript errors.

- [ ] **Step 5.3: Commit**

```bash
git add components/community/ManageSubscriptionModal.tsx
git commit -m "feat(manage-subscription): modal details view"
```

---

## Task 6: Wire the card-update flow into the modal

**Files:**
- Modify: `components/community/ManageSubscriptionModal.tsx`

The pattern mirrors `components/PreRegistrationPaymentModal.tsx` — load Stripe with the connected account, render Elements with the SetupIntent client_secret, `confirmSetup` with `redirect: 'if_required'`, then POST the resulting paymentMethodId to our payment-method route.

We need the connected account ID on the client to load Stripe correctly. The simplest path: have the parent (FeedClient) already knows it from the community fetch and passes it as a prop. We added a `stripeAccountId` prop in this task.

- [ ] **Step 6.1: Update the modal to accept stripeAccountId + add update-card view**

Replace the entire `components/community/ManageSubscriptionModal.tsx` with the version below. The changes vs Task 5:

1. New `stripeAccountId` prop.
2. New `view` state: `"details" | "update"`.
3. New `UpdateCardForm` sub-component using Elements/PaymentElement.
4. The Update button now switches to the update view and creates the SetupIntent.
5. On success, the modal re-fetches the summary and returns to details view.

```tsx
"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle } from "lucide-react";
import { loadStripe, type Stripe as StripeClient } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { toast } from "react-hot-toast";

type Status = "active" | "past_due" | "canceled" | "incomplete" | string;

interface SubscriptionSummary {
  status: Status;
  currency: string;
  amount: number;
  interval: string;
  currentPeriodEnd: number;
  defaultPaymentMethod: { brand: string; last4: string } | null;
}

interface Payment {
  id: string;
  paidAt: number;
  amount: number;
  currency: string;
  hostedInvoiceUrl: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  communitySlug: string;
  stripeAccountId: string;
}

const formatMoney = (minor: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(minor / 100);

const formatDate = (unixSec: number) =>
  new Date(unixSec * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const intervalLabel = (interval: string) =>
  interval === "month" ? "Monthly" : interval === "year" ? "Yearly" : interval;

const brandLabel = (brand: string) =>
  brand.charAt(0).toUpperCase() + brand.slice(1);

function UpdateCardForm({
  communitySlug,
  onSuccess,
  onCancel,
}: {
  communitySlug: string;
  onSuccess: (result: { retried: boolean; retryError?: string }) => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);

    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
      });
      if (error) throw error;
      if (!setupIntent || setupIntent.status !== "succeeded") {
        throw new Error("Card was not saved. Please try again.");
      }
      const paymentMethodId =
        typeof setupIntent.payment_method === "string"
          ? setupIntent.payment_method
          : setupIntent.payment_method?.id;
      if (!paymentMethodId) throw new Error("Missing payment method.");

      const resp = await fetch(
        `/api/community/${communitySlug}/subscription/payment-method`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentMethodId }),
        }
      );
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error ?? "Failed to update card.");
      }
      onSuccess({ retried: data.retried, retryError: data.retryError });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update card.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      <PaymentElement />
      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!stripe || submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>
    </form>
  );
}

export function ManageSubscriptionModal({
  isOpen,
  onClose,
  communitySlug,
  stripeAccountId,
}: Props) {
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"details" | "update">("details");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripePromise, setStripePromise] =
    useState<Promise<StripeClient | null> | null>(null);

  const fetchAll = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, p] = await Promise.all([
        fetch(`/api/community/${communitySlug}/subscription`).then((r) =>
          r.ok ? r.json() : Promise.reject(r)
        ),
        fetch(`/api/community/${communitySlug}/subscription/payments`).then(
          (r) => (r.ok ? r.json() : Promise.reject(r))
        ),
      ]);
      setSummary(s);
      setPayments(p.invoices ?? []);
    } catch {
      setError("Could not load subscription details.");
    } finally {
      setLoading(false);
    }
  }, [communitySlug]);

  useEffect(() => {
    if (!isOpen) {
      setView("details");
      setClientSecret(null);
      return;
    }
    fetchAll();
  }, [isOpen, fetchAll]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) return;
    setStripePromise(loadStripe(key, { stripeAccount: stripeAccountId }));
  }, [stripeAccountId]);

  const startUpdate = async () => {
    try {
      const resp = await fetch(
        `/api/community/${communitySlug}/subscription/setup-intent`,
        { method: "POST" }
      );
      const data = await resp.json();
      if (!resp.ok || !data.clientSecret) {
        throw new Error(data.error ?? "Could not start card update.");
      }
      setClientSecret(data.clientSecret);
      setView("update");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not start card update.");
    }
  };

  const handleUpdateSuccess = (result: {
    retried: boolean;
    retryError?: string;
  }) => {
    if (result.retryError) {
      toast.success("Card updated. We'll retry the pending charge automatically.");
    } else if (result.retried) {
      toast.success("Card updated and payment completed.");
    } else {
      toast.success("Card updated.");
    }
    setView("details");
    setClientSecret(null);
    fetchAll();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage subscription</DialogTitle>
          <DialogDescription>
            {view === "details"
              ? "View your plan and update the card on file."
              : "Enter a new card. The old one will be replaced."}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-destructive py-4">{error}</p>
        )}

        {!loading && summary && view === "details" && (
          <div className="space-y-6 py-2">
            <section>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                Plan
              </h3>
              <p className="text-sm">
                {intervalLabel(summary.interval)} ·{" "}
                {formatMoney(summary.amount, summary.currency)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Next charge: {formatDate(summary.currentPeriodEnd)}
              </p>

              {summary.status === "past_due" && (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>
                    Your last payment did not go through. Update your card to
                    fix it.
                  </p>
                </div>
              )}
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                Payment method
              </h3>
              <div className="flex items-center justify-between rounded-md border p-3">
                <p className="text-sm">
                  {summary.defaultPaymentMethod
                    ? `${brandLabel(summary.defaultPaymentMethod.brand)} •••• ${summary.defaultPaymentMethod.last4}`
                    : "No card on file"}
                </p>
                <Button
                  variant={summary.defaultPaymentMethod ? "outline" : "default"}
                  size="sm"
                  onClick={startUpdate}
                >
                  Update
                </Button>
              </div>
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                Recent payments
              </h3>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No payments yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {payments.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span>
                        {formatDate(p.paidAt)} ·{" "}
                        {formatMoney(p.amount, p.currency)}
                      </span>
                      {p.hostedInvoiceUrl && (
                        <a
                          href={p.hostedInvoiceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline text-xs"
                        >
                          Receipt
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {view === "update" && clientSecret && stripePromise && (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: { theme: "stripe" as const },
            }}
          >
            <UpdateCardForm
              communitySlug={communitySlug}
              onSuccess={handleUpdateSuccess}
              onCancel={() => {
                setView("details");
                setClientSecret(null);
              }}
            />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6.2: Type-check**

Run: `bun run build`
Expected: no new TypeScript errors. If the `stripeAccount` option on `loadStripe` errors, confirm `@stripe/stripe-js` is the same version used by `PreRegistrationPaymentModal.tsx` (it should be — they're peers).

- [ ] **Step 6.3: Commit**

```bash
git add components/community/ManageSubscriptionModal.tsx
git commit -m "feat(manage-subscription): card update flow with guarded toast"
```

---

## Task 7: Wire Manage button into sidebar + FeedClient

**Files:**
- Modify: `components/community/CommunitySidebar.tsx`
- Modify: `app/[communitySlug]/FeedClient.tsx`

- [ ] **Step 7.1: Update CommunitySidebar props and render the Manage button**

Open `components/community/CommunitySidebar.tsx`. Two surgical changes:

1. **Extend the props interface** (around line 45 where `onLeaveClick` is defined). Add:

```ts
onManageClick: () => void;
subscriptionStatus: string | null;
```

2. **Add the prop to the function signature** (around line 108 where `onLeaveClick` is destructured). Add `onManageClick` and `subscriptionStatus` next to it.

3. **Render the Manage button above the Leave button.** In the `isMember` branch (currently around line 301-308), replace the single `<Button>` with a stacked layout:

```tsx
) : isMember ? (
  <div className="space-y-2">
    {(subscriptionStatus === "active" ||
      subscriptionStatus === "past_due") && (
      <Button
        onClick={onManageClick}
        variant="outline"
        className="w-full"
      >
        Manage
      </Button>
    )}
    <Button
      onClick={onLeaveClick}
      variant="outline"
      className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
    >
      Leave Community
    </Button>
  </div>
) : (
```

- [ ] **Step 7.2: Wire FeedClient state and pass props**

Open `app/[communitySlug]/FeedClient.tsx`.

1. Find the `showLeaveDialog` state (line 203 area) and add alongside it:

```tsx
const [showManageModal, setShowManageModal] = useState(false);
```

2. Import the new modal near the other modal imports at the top:

```tsx
import { ManageSubscriptionModal } from "@/components/community/ManageSubscriptionModal";
```

3. Find where `CommunitySidebar` is rendered (around line 760 where `onLeaveClick` is passed). Add two new props:

```tsx
onManageClick={() => setShowManageModal(true)}
subscriptionStatus={/* the existing variable for this — see step 7.3 */}
```

4. Just before the existing `<AlertDialog open={showLeaveDialog} ...>` (line 847 area), render the modal. `FeedClient` already has the community data loaded; use the community's `stripe_account_id` and slug:

```tsx
{community?.stripe_account_id && (
  <ManageSubscriptionModal
    isOpen={showManageModal}
    onClose={() => setShowManageModal(false)}
    communitySlug={params.communitySlug}
    stripeAccountId={community.stripe_account_id}
  />
)}
```

- [ ] **Step 7.3: Resolve the `subscriptionStatus` source**

`FeedClient.tsx` already fetches the member's status to decide whether to show the leave button. Grep for `subscription_status` inside that file:

```bash
grep -n "subscription_status\|subscriptionStatus" app/[communitySlug]/FeedClient.tsx
```

Use whatever existing variable holds the current member's subscription_status. If none exists (it's possible only `isMember`/`memberStatus` are tracked), thread the status through from the same fetch that already populates `isMember`. The member fetch already returns the row — pull `subscription_status` off it.

If for some reason the member row isn't already fetched in FeedClient, **stop and ask** before adding a new fetch. Don't double-fetch.

- [ ] **Step 7.4: Type-check + manual smoke**

Run: `bun run build`
Expected: no new TypeScript errors.

Then run `bun dev` in the preprod worktree and verify:
- As an active member: Manage button appears above Leave.
- As a non-member: only Join button is visible (no Manage).
- Clicking Manage opens the modal and loads details.

- [ ] **Step 7.5: Commit**

```bash
git add components/community/CommunitySidebar.tsx app/\[communitySlug\]/FeedClient.tsx
git commit -m "feat(manage-subscription): wire Manage button + modal into community page"
```

---

## Task 8: Component test for modal render states

**Files:**
- Create: `__tests__/components/ManageSubscriptionModal.test.tsx`

This is a lightweight smoke test that the modal renders the right thing for the three key data states: loading, error, loaded-with-active-sub. Stripe Elements is mocked out (we are not testing the card form behavior in Jest — that's manual on preprod).

- [ ] **Step 8.1: Create the test file**

Create `__tests__/components/ManageSubscriptionModal.test.tsx`:

```tsx
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { ManageSubscriptionModal } from "@/components/community/ManageSubscriptionModal";

// Mock Stripe Elements — we only render the details view in these tests.
jest.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: any) => <>{children}</>,
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => null,
  useElements: () => null,
}));
jest.mock("@stripe/stripe-js", () => ({
  loadStripe: () => Promise.resolve(null),
}));

const summaryFixture = {
  status: "active",
  currency: "eur",
  amount: 2500,
  interval: "month",
  currentPeriodEnd: 1750000000,
  defaultPaymentMethod: { brand: "visa", last4: "4242" },
};

const paymentsFixture = {
  invoices: [
    {
      id: "in_1",
      paidAt: 1747000000,
      amount: 2500,
      currency: "eur",
      hostedInvoiceUrl: "https://example.test/inv",
    },
  ],
};

const mockFetch = (responses: Record<string, any>) => {
  global.fetch = jest.fn((url: any) => {
    const key = String(url);
    const match = Object.keys(responses).find((k) => key.endsWith(k));
    if (!match) {
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(responses[match]),
    });
  }) as any;
};

describe("ManageSubscriptionModal", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("renders plan, next charge, current card, and recent payments", async () => {
    mockFetch({
      "/subscription": summaryFixture,
      "/subscription/payments": paymentsFixture,
    });

    render(
      <ManageSubscriptionModal
        isOpen={true}
        onClose={() => {}}
        communitySlug="test"
        stripeAccountId="acct_test"
      />
    );

    await waitFor(() =>
      expect(screen.getByText(/Monthly/)).toBeInTheDocument()
    );
    expect(screen.getByText(/€25.00/)).toBeInTheDocument();
    expect(screen.getByText(/Visa •••• 4242/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Receipt/ })).toHaveAttribute(
      "href",
      "https://example.test/inv"
    );
  });

  it("shows past_due banner when status is past_due", async () => {
    mockFetch({
      "/subscription": { ...summaryFixture, status: "past_due" },
      "/subscription/payments": { invoices: [] },
    });

    render(
      <ManageSubscriptionModal
        isOpen={true}
        onClose={() => {}}
        communitySlug="test"
        stripeAccountId="acct_test"
      />
    );

    await waitFor(() =>
      expect(
        screen.getByText(/Your last payment did not go through/)
      ).toBeInTheDocument()
    );
  });

  it("shows error when summary fetch fails", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
    ) as any;

    render(
      <ManageSubscriptionModal
        isOpen={true}
        onClose={() => {}}
        communitySlug="test"
        stripeAccountId="acct_test"
      />
    );

    await waitFor(() =>
      expect(
        screen.getByText(/Could not load subscription details/)
      ).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 8.2: Run the tests**

Run: `bun test __tests__/components/ManageSubscriptionModal.test.tsx`
Expected: all 3 tests pass.

- [ ] **Step 8.3: Commit**

```bash
git add __tests__/components/ManageSubscriptionModal.test.tsx
git commit -m "test(manage-subscription): modal render states"
```

---

## Task 9: Manual preprod verification

These tests exercise the Stripe code paths that no Jest test will cover. Run them in the preprod worktree against test-mode Stripe.

**Setup:**

- [ ] **Step 9.1: Confirm preprod is on test-mode Stripe keys**

Check that `.env.preprod.test` is the active env (per the `project_preprod_stripe_live_keys` memory). If preprod is currently on live keys, swap to test first:

```bash
cd /home/debian/apps/dance-hub-preprod
ls -la .env.preprod*
# If .env.preprod points to live, swap:
# cp .env.preprod.test .env.preprod
```

- [ ] **Step 9.2: Push and deploy to preprod**

```bash
cd /home/debian/apps/dance-hub-preprod
git push -u origin feat/manage-subscription
./deploy-preprod.sh   # per project memory feedback_use_deploy_sh_for_main
```

- [ ] **Step 9.3: Run test scenarios**

For each scenario below, log the outcome in this file by checking the box and adding a one-line note.

**Test cards** (from the Stripe test cards skill):
- `4242 4242 4242 4242` — succeeds immediately
- `4000 0025 0000 3155` — requires 3DS authentication
- `4000 0000 0000 0341` — attaches successfully but fails on charge (use to simulate past_due retry failure)

Each scenario assumes a test student account joined a test community with a monthly subscription.

- [ ] **Scenario A: Active subscription, swap card to a working one**
  1. Member status: active. Card on file: 4242.
  2. Open Manage modal — verify plan, next charge, card, recent payments display correctly.
  3. Click Update, enter `4000 0566 5566 5556` (Visa debit), Save.
  4. Modal returns to details. Card now shows `Visa •••• 5556`.
  5. **Critical:** Check Stripe Dashboard → confirm NO new invoice was created and NO charge was attempted.
  6. Confirm subscription's `default_payment_method` is the new PM.

- [ ] **Scenario B: Past_due subscription, swap to working card, immediate retry succeeds**
  1. Force past_due: in Stripe Dashboard, refund + void the latest invoice or create a test customer with a failing card. (Easier: use a community where the test student's card has been swapped to `4000 0000 0000 0341` and waited for renewal failure.)
  2. Open Manage — verify amber banner appears.
  3. Click Update, enter `4242 4242 4242 4242`, Save.
  4. Toast: "Card updated and payment completed."
  5. Modal refreshes — past_due banner gone, status = active.

- [ ] **Scenario C: Past_due, swap card, retry fails**
  1. Past_due subscription as in Scenario B.
  2. Click Update, enter `4000 0000 0000 0341` (attaches but fails on charge), Save.
  3. Toast: "Card updated. We'll retry the pending charge automatically."
  4. Status still `past_due`; new card is shown as default; Stripe Dashboard shows the failed retry attempt.

- [ ] **Scenario D: 3DS card on swap**
  1. Active subscription.
  2. Click Update, enter `4000 0025 0000 3155`, Save.
  3. 3DS modal appears in Stripe Elements iframe — complete it.
  4. Modal returns to details with the new card. No charge attempted (active subscription).

- [ ] **Scenario E: Auth gate**
  1. Sign out.
  2. From devtools: `fetch('/api/community/<slug>/subscription').then(r => r.status)`.
  3. Expected: 401.

- [ ] **Scenario F: Cross-member auth gate (most important)**
  1. As member of community A, get their `stripe_subscription_id` from the modal.
  2. Sign in as member of community B.
  3. Open devtools: `fetch('/api/community/<community-A-slug>/subscription').then(r => r.status)`.
  4. Expected: 404 (because the route looks up `community_members` for the *calling* user's row in community A, which doesn't exist).
  5. Confirm there is no way to act on someone else's subscription.

- [ ] **Step 9.4: If all scenarios pass, mark plan complete and open PR for review**

```bash
gh pr create --title "feat: subscription management modal" --body "$(cat <<'EOF'
## Summary
- Adds a "Manage" sidebar button for active/past_due community members.
- Modal shows plan, next charge, current card, last 5 paid invoices.
- Members can swap their card on file via PaymentElement + SetupIntent on the connected account.
- Past_due card swaps trigger a guarded immediate retry (status gate + invoice-status gate + post-update re-fetch).

## Test plan
- [x] Active sub card swap — no charge fired (verified Stripe Dashboard)
- [x] Past_due card swap with successful retry
- [x] Past_due card swap with failing retry — toast worded correctly, status stays past_due
- [x] 3DS card on swap
- [x] Unauthenticated request → 401
- [x] Cross-member request → 404

Spec: `docs/superpowers/specs/2026-05-17-manage-subscription-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

**Spec coverage check:**
- Sidebar button gating (active/past_due only) → Task 7 (`subscriptionStatus` check inline)
- Modal layout (plan / payment method / recent payments) → Tasks 5–6
- 4 API routes → Tasks 1–4 (one per task)
- Three-guard retry logic → Task 4 step 4.1 (with prose explaining why each guard exists)
- No new tables, no DB writes → confirmed (only reads `community_members`)
- 3DS handling → Task 6 (`redirect: 'if_required'`)
- Past_due retry toast wording → Task 6 (`handleUpdateSuccess` branches on `retryError`)
- No vendor names in copy → confirmed throughout
- No em dashes in UI copy → confirmed (all strings use periods/commas)
- Connected account scope (`stripeAccount`) → every route call

**Open risks (call out to user, do not silently absorb):**
- **`subscriptionStatus` source in FeedClient (Task 7.3):** if it's not already present, the worker should pause. This avoids a second fetch.
- **Force-creating a past_due state for Scenarios B/C** is awkward in Stripe test mode. The current options are: (1) refund/void the latest invoice manually in Stripe Dashboard, or (2) swap a member's card to `4000 0000 0000 0341` and wait for the next renewal. Option 1 is faster but less faithful. If the implementer can't reproduce past_due cleanly, document the partial verification in the PR rather than skipping the scenarios.

---

Plan complete and saved to `docs/superpowers/plans/2026-05-17-manage-subscription.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session with checkpoints for review.

Which approach?
