import { NextResponse } from 'next/server';
import { getSession, type Session } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';

export interface BroadcastCommunity {
  id: string;
  name: string;
  slug: string;
  created_by: string;
  is_broadcast_vip: boolean;
}

export type AuthzResult =
  | { ok: true; session: Session; community: BroadcastCommunity }
  | { ok: false; response: NextResponse };

/**
 * Shared gate for every broadcast-related API route:
 * - requires an authenticated session
 * - requires the user to be the community owner
 * - enforces the NEXT_PUBLIC_BROADCASTS_ENABLED kill-switch, with VIP bypass
 *
 * Returns either the resolved community + session, or a ready-to-return
 * NextResponse to abort the request with the appropriate status.
 */
export async function authorizeBroadcastAccess(
  communitySlug: string
): Promise<AuthzResult> {
  const session = await getSession();
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const community = await queryOne<BroadcastCommunity>`
    SELECT id, name, slug, created_by, is_broadcast_vip
    FROM communities
    WHERE slug = ${communitySlug}
  `;
  if (!community) {
    return { ok: false, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }
  if (community.created_by !== session.user.id) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  const featureEnabled = process.env.NEXT_PUBLIC_BROADCASTS_ENABLED === 'true';
  if (!featureEnabled && !community.is_broadcast_vip) {
    // Respond 404 (rather than 403) to avoid revealing the feature exists on
    // this deployment to clients for whom it is gated off.
    return { ok: false, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }

  return { ok: true, session, community };
}
