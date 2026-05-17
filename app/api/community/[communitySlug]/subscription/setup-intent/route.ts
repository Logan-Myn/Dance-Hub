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
