import { cache } from 'react';
import { queryOne } from './db';

export interface CommunityRow {
  id: string;
  created_by: string;
  name: string;
  description: string | null;
  image_url: string | null;
  slug: string;
}

// cache() dedupes calls within a single server render pass. Layout and
// pages can both call this and only one DB round-trip happens.
export const getCommunityBySlug = cache(async (slug: string) => {
  return queryOne<CommunityRow>`
    SELECT id, created_by, name, description, image_url, slug
    FROM communities WHERE slug = ${slug}
  `;
});

// Mirrors the logic in /api/community/[slug]/check-subscription: active OR
// in grace period after cancel. Returns false when user has no row.
export const getCommunityMembership = cache(async (communityId: string, userId: string) => {
  const member = await queryOne<{
    status: string;
    subscription_status: string | null;
    current_period_end: string | null;
  }>`
    SELECT status, subscription_status, current_period_end
    FROM community_members
    WHERE community_id = ${communityId}
      AND user_id = ${userId}
  `;
  if (!member) return false;
  const periodEnd = member.current_period_end ? new Date(member.current_period_end) : null;
  const inGracePeriod =
    member.subscription_status === 'canceling' && periodEnd && periodEnd > new Date();
  return member.status === 'active' || !!inGracePeriod;
});
