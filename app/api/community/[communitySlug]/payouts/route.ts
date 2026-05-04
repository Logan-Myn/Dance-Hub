import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { queryOne } from "@/lib/db";

interface CommunityStripeAccount {
  stripe_account_id: string | null;
}

export async function GET(
  request: Request,
  { params }: { params: { communitySlug: string } }
) {
  try {
    const { communitySlug } = params;

    // Get community data to fetch stripe_account_id
    const community = await queryOne<CommunityStripeAccount>`
      SELECT stripe_account_id
      FROM communities
      WHERE slug = ${communitySlug}
    `;

    if (!community) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }

    if (!community.stripe_account_id) {
      return NextResponse.json({
        error: "Stripe account not connected",
        payouts: [],
        balance: null,
      }, { status: 400 });
    }

    // Fetch upcoming payout (balance)
    const balance = await stripe.balance.retrieve({
      stripeAccount: community.stripe_account_id,
    });

    // Fetch recent payouts
    const payouts = await stripe.payouts.list(
      {
        limit: 10,
        expand: ['data.destination'],
      },
      {
        stripeAccount: community.stripe_account_id,
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
