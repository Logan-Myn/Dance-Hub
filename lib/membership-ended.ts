import { sql } from '@/lib/db';
import type { MembershipRow } from '@/lib/community-data';

// Subscription statuses after which Stripe will never charge or renew again.
export const ENDED_SUBSCRIPTION_STATUSES: readonly string[] = ['canceled', 'incomplete_expired'];

/**
 * Brings our row in line with a subscription Stripe has already ended, for
 * when the customer.subscription.deleted webhook never reached this app.
 * Returns the updated row, or undefined if it was already inactive (so the
 * member isn't counted out twice).
 */
export async function markMembershipEnded(
  communityId: string,
  userId: string,
  stripeStatus: string,
): Promise<MembershipRow | undefined> {
  const [row] = await sql<MembershipRow[]>`
    UPDATE community_members
    SET status = 'inactive',
        subscription_status = ${stripeStatus},
        cancelled_at = NOW()
    WHERE community_id = ${communityId}
      AND user_id = ${userId}
      AND status <> 'inactive'
    RETURNING status, subscription_status, current_period_end
  `;
  if (!row) return undefined;

  try {
    await sql`SELECT decrement_members_count(${communityId})`;
  } catch (countError) {
    console.error('Error updating members count on reconcile:', countError);
  }
  return row;
}
