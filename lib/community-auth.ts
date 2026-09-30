import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getSession, type Session } from '@/lib/auth-session';
import { getMembershipStatus, getUserIsAdmin } from '@/lib/community-data';

/** True if the user created the community or is a platform admin. */
export async function userCanManageCommunity(userId: string, communityId: string): Promise<boolean> {
  const community = await queryOne<{ created_by: string }>`
    SELECT created_by FROM communities WHERE id = ${communityId}
  `;
  if (!community) return false;
  if (community.created_by === userId) return true;
  return getUserIsAdmin(userId);
}

/**
 * True if the Mux asset belongs to the community — either a course lesson video
 * (lessons.video_asset_id) or the community's About-page video (asset id stored in
 * the about_page JSONB). Used to prevent attaching/listing/deleting audio tracks
 * on another community's asset.
 */
export async function assetBelongsToCommunity(assetId: string, communityId: string): Promise<boolean> {
  const lessonOwned = await queryOne<{ one: number }>`
    SELECT 1 AS one
    FROM lessons l
    JOIN chapters ch ON ch.id = l.chapter_id
    JOIN courses co ON co.id = ch.course_id
    WHERE l.video_asset_id = ${assetId} AND co.community_id = ${communityId}
    LIMIT 1
  `;
  if (lessonOwned) return true;

  // Exact match on a saved video section. A substring match on the whole
  // about_page text let any text containing the id pass (and % / _ in the
  // id acted as wildcards).
  const aboutOwned = await queryOne<{ one: number }>`
    SELECT 1 AS one
    FROM communities c,
      jsonb_array_elements(
        CASE WHEN jsonb_typeof(c.about_page -> 'sections') = 'array'
          THEN c.about_page -> 'sections'
          ELSE '[]'::jsonb
        END
      ) AS s
    WHERE c.id = ${communityId}
      AND s -> 'content' ->> 'videoAssetId' = ${assetId}
    LIMIT 1
  `;
  return Boolean(aboutOwned);
}

// ---------------------------------------------------------------------------
// Route guards. Each returns either the resolved context or a ready-to-return
// NextResponse, so a handler reads:
//
//   const guard = await requireCommunityManager(slug);
//   if (!guard.ok) return guard.response;
//
// Always take the acting user from guard.session, never from the request body.
// ---------------------------------------------------------------------------

export interface GuardedCommunity {
  id: string;
  slug: string;
  name: string;
  created_by: string;
  stripe_account_id: string | null;
}

type Fail = { ok: false; response: NextResponse };
export type SessionGuard = { ok: true; session: Session } | Fail;
export type CommunityGuard =
  | { ok: true; session: Session; community: GuardedCommunity }
  | Fail;

const deny = (status: 401 | 403 | 404, error: string): Fail => ({
  ok: false,
  response: NextResponse.json({ error }, { status }),
});

async function loadCommunityBySlug(slug: string) {
  return queryOne<GuardedCommunity>`
    SELECT id, slug, name, created_by, stripe_account_id
    FROM communities WHERE slug = ${slug}
  `;
}

/** Any signed-in user. */
export async function requireSession(): Promise<SessionGuard> {
  const session = await getSession();
  if (!session) return deny(401, 'Authentication required');
  return { ok: true, session };
}

/** Platform admin (profiles.is_admin, same source as the other admin routes). */
export async function requirePlatformAdmin(): Promise<SessionGuard> {
  const session = await getSession();
  if (!session) return deny(401, 'Authentication required');
  if (!(await getUserIsAdmin(session.user.id))) return deny(403, 'Forbidden');
  return { ok: true, session };
}

/** Community owner or platform admin. */
export async function requireCommunityManager(slug: string): Promise<CommunityGuard> {
  const session = await getSession();
  if (!session) return deny(401, 'Authentication required');
  const community = await loadCommunityBySlug(slug);
  if (!community) return deny(404, 'Community not found');
  if (!(await userCanManageCommunity(session.user.id, community.id))) {
    return deny(403, 'Forbidden');
  }
  return { ok: true, session, community };
}

/**
 * Anyone allowed inside the community: active member (or in the grace period
 * after cancelling), owner, or platform admin. Pre-registered users count only
 * when allowPreRegistered is set, matching the feed page; the classroom does
 * not let them in.
 */
export async function requireCommunityViewer(
  slug: string,
  opts: { allowPreRegistered?: boolean } = {}
): Promise<CommunityGuard> {
  const session = await getSession();
  if (!session) return deny(401, 'Authentication required');
  const community = await loadCommunityBySlug(slug);
  if (!community) return deny(404, 'Community not found');
  if (await canViewCommunity(session.user.id, community, opts)) {
    return { ok: true, session, community };
  }
  return deny(403, 'Members only');
}

/** Same rule as requireCommunityViewer, for routes that start from a community id. */
export async function canViewCommunity(
  userId: string,
  community: { id: string; created_by: string },
  opts: { allowPreRegistered?: boolean } = {}
): Promise<boolean> {
  if (community.created_by === userId) return true;
  const [membership, isAdmin] = await Promise.all([
    getMembershipStatus(community.id, userId),
    getUserIsAdmin(userId),
  ]);
  if (isAdmin || membership.isMember) return true;
  return !!opts.allowPreRegistered && membership.isPreRegistered;
}

/** Owner or admin of the community whose Stripe Connect account is accountId. */
export async function requireStripeAccountManager(accountId: string): Promise<CommunityGuard> {
  const session = await getSession();
  if (!session) return deny(401, 'Authentication required');
  if (!accountId) return deny(404, 'Account not found');
  const community = await queryOne<GuardedCommunity>`
    SELECT id, slug, name, created_by, stripe_account_id
    FROM communities WHERE stripe_account_id = ${accountId}
  `;
  // 404 rather than 403 so the route does not confirm which accounts exist.
  if (!community) return deny(404, 'Account not found');
  if (!(await userCanManageCommunity(session.user.id, community.id))) {
    return deny(404, 'Account not found');
  }
  return { ok: true, session, community };
}
