import { queryOne } from '@/lib/db';
import { FREE_QUOTA_PER_MONTH, PAID_SOFT_CAP_PER_MONTH } from './constants';

export type QuotaTier = 'vip' | 'paid' | 'free';

export interface Quota {
  tier: QuotaTier;
  used: number;
  /** Null when unlimited (VIP). */
  limit: number | null;
}

export type CanSendResult =
  | { allowed: true }
  | { allowed: false; reason: 'quota_exhausted' | 'soft_cap_reached'; quota: Quota };

async function getUsedThisMonth(communityId: string): Promise<number> {
  const row = await queryOne<{ count: number }>`
    SELECT COUNT(*)::int AS count
    FROM email_broadcasts
    WHERE community_id = ${communityId}
      AND created_at >= date_trunc('month', now())
      AND status IN ('sent', 'sending', 'partial_failure')
  `;
  return row?.count ?? 0;
}

export async function getQuota(communityId: string): Promise<Quota> {
  const [community, subscription, used] = await Promise.all([
    queryOne<{ is_broadcast_vip: boolean }>`
      SELECT is_broadcast_vip FROM communities WHERE id = ${communityId}
    `,
    queryOne<{ status: string }>`
      SELECT status
      FROM community_broadcast_subscriptions
      WHERE community_id = ${communityId}
    `,
    getUsedThisMonth(communityId),
  ]);

  if (community?.is_broadcast_vip) {
    return { tier: 'vip', used, limit: null };
  }

  if (subscription?.status === 'active') {
    return { tier: 'paid', used, limit: PAID_SOFT_CAP_PER_MONTH };
  }

  return { tier: 'free', used, limit: FREE_QUOTA_PER_MONTH };
}

export async function checkCanSend(communityId: string): Promise<CanSendResult> {
  const quota = await getQuota(communityId);
  if (quota.limit === null) return { allowed: true };
  if (quota.used < quota.limit) return { allowed: true };
  return {
    allowed: false,
    reason: quota.tier === 'paid' ? 'soft_cap_reached' : 'quota_exhausted',
    quota,
  };
}
