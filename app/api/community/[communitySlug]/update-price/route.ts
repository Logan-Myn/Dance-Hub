import { NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
import { stripe } from "@/lib/stripe";

interface Community {
  id: string;
  name: string;
  created_by: string;
  stripe_product_id: string | null;
  stripe_account_id: string | null;
}

export async function POST(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    const { price, enabled, yearlyEnabled, yearlyPrice, yearlyBenefits } = await request.json();
    const { communitySlug } = params;

    // Get community by slug with stripe details
    const community = await queryOne<Community>`
      SELECT id, name, created_by, stripe_product_id, stripe_account_id
      FROM communities
      WHERE slug = ${communitySlug}
    `;

    if (!community) {
      console.error("Community not found");
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    const stripeAccountId = community.stripe_account_id;

    // If membership is enabled and there's a price, create or update Stripe price
    let stripe_price_id = null;
    let stripe_yearly_price_id: string | null = null;
    if (enabled && price > 0) {
      if (!stripeAccountId) {
        return NextResponse.json(
          { error: "Stripe account not connected" },
          { status: 400 }
        );
      }
      // First, create a product for the community if it doesn't exist
      let product_id = community.stripe_product_id;

      if (!product_id) {
        const product = await stripe.products.create(
          {
            name: `${community.name} Membership`,
            description: `Monthly membership for ${community.name}`,
          },
          {
            stripeAccount: stripeAccountId,
          }
        );
        product_id = product.id;
      }

      // Create a new price in Stripe
      const stripePrice = await stripe.prices.create(
        {
          product: product_id,
          unit_amount: price * 100, // Convert to cents
          currency: "eur",
          recurring: { interval: "month" },
        },
        {
          stripeAccount: stripeAccountId,
        }
      );

      stripe_price_id = stripePrice.id;

      // Yearly price (optional). Reuse the same product; create a second Price with
      // a yearly interval. Stripe prices are immutable, so a changed price = new id.
      if (enabled && yearlyEnabled && yearlyPrice > 0) {
        if (!stripeAccountId) {
          return NextResponse.json({ error: "Stripe account not connected" }, { status: 400 });
        }
        // product_id is guaranteed here because the monthly branch above created/loaded it.
        const yearlyStripePrice = await stripe.prices.create(
          {
            product: product_id!,
            unit_amount: Math.round(yearlyPrice * 100),
            currency: "eur",
            recurring: { interval: "year" },
          },
          { stripeAccount: stripeAccountId },
        );
        stripe_yearly_price_id = yearlyStripePrice.id;
      }

      // Update community with both product and price IDs
      await sql`
        UPDATE communities
        SET
          membership_enabled = ${enabled},
          membership_price = ${price},
          stripe_product_id = ${product_id},
          stripe_price_id = ${stripe_price_id},
          yearly_enabled = ${!!yearlyEnabled && !!stripe_yearly_price_id},
          yearly_price = ${yearlyEnabled ? yearlyPrice : null},
          stripe_yearly_price_id = ${stripe_yearly_price_id ?? null},
          yearly_benefits = ${yearlyBenefits ?? null},
          updated_at = NOW()
        WHERE id = ${community.id}
      `;
    } else {
      // If disabling membership or price is 0, just update the membership status
      await sql`
        UPDATE communities
        SET
          membership_enabled = ${enabled},
          membership_price = ${price},
          yearly_enabled = ${!!yearlyEnabled && !!stripe_yearly_price_id},
          yearly_price = ${yearlyEnabled ? yearlyPrice : null},
          stripe_yearly_price_id = ${stripe_yearly_price_id ?? null},
          yearly_benefits = ${yearlyBenefits ?? null},
          updated_at = NOW()
        WHERE id = ${community.id}
      `;
    }

    return NextResponse.json({
      success: true,
      stripe_price_id,
      stripe_yearly_price_id,
    });
  } catch (error) {
    console.error("Error updating price:", error);
    return NextResponse.json(
      { error: "Failed to update price" },
      { status: 500 }
    );
  }
}
