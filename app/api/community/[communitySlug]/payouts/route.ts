import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { requireCommunityManager } from "@/lib/community-auth";

export async function GET(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await props.params;
  const guard = await requireCommunityManager(communitySlug);
  if (!guard.ok) return guard.response;

  const stripeAccountId = guard.community.stripe_account_id;

  try {
    if (!stripeAccountId) {
      return NextResponse.json({
        error: "Payout account not connected",
        payouts: [],
        balance: null,
      }, { status: 400 });
    }

    // Fetch upcoming payout (balance)
    const balance = await stripe.balance.retrieve({
      stripeAccount: stripeAccountId,
    });

    // Fetch recent payouts
    const payouts = await stripe.payouts.list(
      {
        limit: 10,
        expand: ['data.destination'],
      },
      {
        stripeAccount: stripeAccountId,
      }
    );

    return NextResponse.json({
      balance: {
        available: balance.available.reduce((sum, bal) => sum + bal.amount, 0) / 100,
        pending: balance.pending.reduce((sum, bal) => sum + bal.amount, 0) / 100,
        currency: balance.available[0]?.currency || 'eur',
      },
      payouts: payouts.data.map(payout => ({
        id: payout.id,
        amount: payout.amount / 100,
        currency: payout.currency,
        arrivalDate: new Date(payout.arrival_date * 1000).toISOString(),
        status: payout.status,
        type: payout.type,
        bankAccount: payout.destination,
      })),
    });
  } catch (error) {
    console.error("Error fetching payout data:", error);
    return NextResponse.json(
      { error: "Failed to fetch payout data" },
      { status: 500 }
    );
  }
}
