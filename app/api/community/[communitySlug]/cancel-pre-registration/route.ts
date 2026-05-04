import { NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
import { stripe } from "@/lib/stripe";

interface Community {
  id: string;
  stripe_account_id: string | null;
}

interface Member {
  id: string;
  community_id: string;
  user_id: string;
  status: string;
  stripe_invoice_id: string | null;
  pre_registration_payment_method_id: string | null;
  stripe_customer_id: string | null;
}

export async function POST(
  request: Request,
  { params }: { params: { communitySlug: string } }
) {
  try {
    const { userId } = await request.json();

    // Get community details
    const community = await queryOne<Community>`
      SELECT id, stripe_account_id
      FROM communities
      WHERE slug = ${params.communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    // Get member record
    const member = await queryOne<Member>`
      SELECT id, community_id, user_id, status, stripe_invoice_id, pre_registration_payment_method_id, stripe_customer_id
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id = ${userId}
    `;

    if (!member) {
      return NextResponse.json(
        { error: "Pre-registration not found" },
        { status: 404 }
      );
    }

    // Verify member is in pre-registration status
    if (member.status !== 'pending_pre_registration' && member.status !== 'pre_registered') {
      return NextResponse.json(
        { error: "Member is not in pre-registration status" },
        { status: 400 }
      );
    }

    // Cancel the scheduled invoice if it exists
    if (member.stripe_invoice_id) {
      try {
        await stripe.invoices.voidInvoice(
          member.stripe_invoice_id,
          {
            stripeAccount: community.stripe_account_id!,
          }
        );
      } catch (stripeError: any) {
        // If invoice is already voided or doesn't exist, that's fine
        if (stripeError.code !== 'invoice_not_found' && stripeError.code !== 'resource_already_exists') {
          console.error("Error voiding invoice:", stripeError);
        }
      }
    }

    // Delete the payment method from Stripe if it exists
    if (member.pre_registration_payment_method_id) {
      try {
        await stripe.paymentMethods.detach(
          member.pre_registration_payment_method_id,
          {
            stripeAccount: community.stripe_account_id!,
          }
        );
      } catch (stripeError: any) {
        // If payment method doesn't exist or is already detached, that's fine
        console.error("Error detaching payment method:", stripeError);
      }
    }

    // Delete the customer from Stripe if it exists
    if (member.stripe_customer_id) {
      try {
        await stripe.customers.del(
          member.stripe_customer_id,
          {
            stripeAccount: community.stripe_account_id!,
          }
        );
      } catch (stripeError: any) {
        // If customer doesn't exist, that's fine
        console.error("Error deleting customer:", stripeError);
      }
    }

    // Remove member record from database
    await sql`
      DELETE FROM community_members
      WHERE community_id = ${community.id}
        AND user_id = ${userId}
    `;

    return NextResponse.json({
      success: true,
      message: "Pre-registration cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling pre-registration:", error);
    return NextResponse.json(
      { error: "Failed to cancel pre-registration" },
      { status: 500 }
    );
  }
}
