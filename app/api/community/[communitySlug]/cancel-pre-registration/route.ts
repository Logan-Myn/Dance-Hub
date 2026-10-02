import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { requireSession } from "@/lib/community-auth";
import { cancelPreRegistration, PRE_REGISTERED_STATUSES } from "@/lib/pre-registration";

interface Community {
  id: string;
  stripe_account_id: string | null;
}

interface Member {
  id: string;
  community_id: string;
  user_id: string;
  status: string;
  stripe_subscription_id: string | null;
  stripe_invoice_id: string | null;
  pre_registration_payment_method_id: string | null;
  stripe_customer_id: string | null;
}

export async function POST(_request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    const guard = await requireSession();
    if (!guard.ok) return guard.response;
    // Only the signed-in user can cancel their own pre-registration.
    const userId = guard.session.user.id;

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
      SELECT id, community_id, user_id, status, stripe_subscription_id, stripe_invoice_id, pre_registration_payment_method_id, stripe_customer_id
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
    if (!PRE_REGISTERED_STATUSES.includes(member.status)) {
      return NextResponse.json(
        { error: "Member is not in pre-registration status" },
        { status: 400 }
      );
    }

    await cancelPreRegistration({
      communityId: community.id,
      userId,
      stripeAccountId: community.stripe_account_id,
      member,
    });

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
