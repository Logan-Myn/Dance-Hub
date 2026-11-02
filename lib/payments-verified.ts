import { sql } from '@/lib/db';
import { trackServer } from '@/lib/analytics-server';
import type { GuardedCommunity } from '@/lib/community-auth';

/**
 * Records that a community's payments account is fully verified: its
 * onboarding progress is marked complete, the row created if the wizard never
 * wrote one. Called from every route that reads the account, because Stripe
 * often finishes verifying after the owner has left the onboarding wizard.
 *
 * The row is written once: the update only applies while
 * verification_completed_at is unset, so a returned row means this is the
 * first time, which is when analytics hears of it. Concurrent calls wait on
 * the row lock and then find it already set.
 */
export async function recordPaymentsVerified(community: GuardedCommunity, accountId: string, actorId: string): Promise<void> {
  const [firstTime] = await sql<{ id: string }[]>`
    INSERT INTO stripe_onboarding_progress (community_id, stripe_account_id, current_step, completed_steps, verification_completed_at)
    VALUES (${community.id}, ${accountId}, 5, ARRAY[1, 2, 3, 4, 5], NOW())
    ON CONFLICT (stripe_account_id) DO UPDATE SET
      current_step = 5,
      completed_steps = ARRAY[1, 2, 3, 4, 5],
      verification_completed_at = NOW(),
      updated_at = NOW()
    WHERE stripe_onboarding_progress.verification_completed_at IS NULL
    RETURNING id
  `;
  if (firstTime) {
    // The teacher's funnel step, even when a platform admin did it for them.
    trackServer(community.created_by, 'payments_connected', {
      community: community.slug,
      by_admin: actorId !== community.created_by,
    });
  }
}
