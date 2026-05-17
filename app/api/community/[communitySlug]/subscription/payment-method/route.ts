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
