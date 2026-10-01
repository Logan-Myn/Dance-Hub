import { NextResponse } from "next/server";
import { query, queryOne, sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { cancelMemberSubscriptions, cancelSubscriptionNow } from "@/lib/subscription-cancel";

interface Profile {
  id: string;
  is_admin: boolean | null;
}

interface Community {
  id: string;
}

export async function DELETE(request: Request, props: { params: Promise<{ communityId: string }> }) {
  const params = await props.params;
  try {
    const { communityId } = params;

    // Verify that the requester is authenticated and is an admin
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify requester is an admin
    const requesterProfile = await queryOne<Profile>`
      SELECT id, is_admin
      FROM profiles
      WHERE auth_user_id = ${session.user.id}
    `;

    if (!requesterProfile?.is_admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Paid private lessons still to come would disappear with the community
    // (and with them any way to refund them), so they must be dealt with first.
    const upcoming = await queryOne<{ count: number }>`
      SELECT COUNT(*)::int AS count
      FROM lesson_bookings
      WHERE community_id = ${communityId}
        AND payment_status = 'succeeded'
        AND lesson_status IN ('booked', 'scheduled')
        AND scheduled_at > NOW()
    `;
    const upcomingCount = upcoming?.count ?? 0;
    if (upcomingCount > 0) {
      return NextResponse.json(
        {
          error: `This community has ${upcomingCount} paid private ${upcomingCount === 1 ? "lesson" : "lessons"} still to come. Cancel or refund ${upcomingCount === 1 ? "it" : "them"} before deleting the community.`,
        },
        { status: 409 }
      );
    }

    const community = await queryOne<{ id: string; stripe_account_id: string | null }>`
      SELECT id, stripe_account_id FROM communities WHERE id = ${communityId}
    `;
    if (!community) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }

    // Cancel every member subscription (on the community's connected account)
    // and the community's broadcast subscription (on the platform account)
    // first: after the delete nothing links them to anyone, and they would
    // keep billing.
    const memberSubscriptions = await query<{
      stripe_subscription_id: string | null;
      subscription_status: string | null;
    }>`
      SELECT stripe_subscription_id, subscription_status
      FROM community_members
      WHERE community_id = ${communityId}
        AND stripe_subscription_id IS NOT NULL
    `;
    const notCancelled = await cancelMemberSubscriptions(
      memberSubscriptions.map((m) => ({ ...m, stripe_account_id: community.stripe_account_id }))
    );

    const broadcast = await queryOne<{ stripe_subscription_id: string; status: string }>`
      SELECT stripe_subscription_id, status
      FROM community_broadcast_subscriptions
      WHERE community_id = ${communityId}
    `;
    if (broadcast && broadcast.status !== "canceled") {
      try {
        await cancelSubscriptionNow(broadcast.stripe_subscription_id, null);
      } catch (cancelError) {
        console.error("Error canceling broadcast subscription:", cancelError);
        notCancelled.push(broadcast.stripe_subscription_id);
      }
    }

    if (notCancelled.length > 0) {
      return NextResponse.json(
        {
          error: `We couldn't cancel ${notCancelled.length} ${notCancelled.length === 1 ? "subscription" : "subscriptions"}, so the community was not deleted. Please try again.`,
        },
        { status: 502 }
      );
    }

    // Use the delete_community RPC function to delete everything in the correct order
    await sql`
      SELECT delete_community(${communityId})
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting community:", error);
    return NextResponse.json(
      { error: "Failed to delete community" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ communityId: string }> }) {
  const params = await props.params;
  try {
    const { communityId } = params;

    // Verify that the requester is authenticated and is an admin
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify requester is an admin
    const requesterProfile = await queryOne<Profile>`
      SELECT id, is_admin
      FROM profiles
      WHERE auth_user_id = ${session.user.id}
    `;

    if (!requesterProfile?.is_admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the update data from the request body
    const updates = await request.json();

    // Validate the updates
    if (!updates.name || !updates.slug) {
      return NextResponse.json(
        { error: "Name and slug are required" },
        { status: 400 }
      );
    }

    // Check if the slug is already taken by another community
    const existingCommunity = await queryOne<Community>`
      SELECT id
      FROM communities
      WHERE slug = ${updates.slug}
        AND id != ${communityId}
    `;

    if (existingCommunity) {
      return NextResponse.json(
        { error: "A community with this slug already exists" },
        { status: 400 }
      );
    }

    // Update the community
    await sql`
      UPDATE communities
      SET
        name = ${updates.name},
        description = ${updates.description},
        slug = ${updates.slug}
      WHERE id = ${communityId}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating community:", error);
    return NextResponse.json(
      { error: "Failed to update community" },
      { status: 500 }
    );
  }
}
