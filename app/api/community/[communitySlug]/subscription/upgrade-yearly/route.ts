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

// Explicit union so `ctx.error` narrows to a NextResponse (not `NextResponse |
// undefined`) under strict mode; inference would add optional-`undefined`
// siblings and leak `undefined` into the route return type.
type ResolveResult =
  | { error: NextResponse }
  | {
      community: Community;
      subId: string;
      itemId: string;
      stripeAccount: string;
      yearlyPriceId: string;
    };

// Resolve the caller's monthly subscription + the community's yearly target.
// Returns a NextResponse on any failure, or the resolved context on success.
async function resolve(communitySlug: string): Promise<ResolveResult> {
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
          // Reset the cycle to now so the preview reflects the real upgrade:
          // the yearly plan starts today, crediting the unused part of the
          // current month. Without this, the month->year proration inflates.
          billing_cycle_anchor: "now",
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
        // Reset the billing cycle to now: the yearly plan starts today, with a
        // credit for the unused part of the current month. Matches the preview.
        billing_cycle_anchor: "now",
        proration_behavior: "always_invoice",
        // Store the price change as a pending update that only applies once the
        // prorated invoice is paid. If the payment needs action (e.g. 3DS) and
        // the member abandons it, the subscription stays on monthly (spec §4).
        payment_behavior: "pending_if_incomplete",
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
