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
