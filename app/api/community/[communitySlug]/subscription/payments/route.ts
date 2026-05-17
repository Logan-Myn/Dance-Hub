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
