import { query } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';
import type { PlatformActivityEvent } from './types';
import { isAccountChargesEnabled } from './revenue';

type SignupRow = {
  auth_user_id: string;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: Date;
};

type CommunityRow = {
  created_by: string;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  community_name: string;
  community_slug: string;
  created_at: Date;
};

type AdminLogRow = {
  action: string;
  resource_type: string | null;
  display_name: string | null;
  full_name: string | null;
  created_at: Date;
};

type StripeAccountRow = {
  stripe_account_id: string;
  slug: string;
};

const FEED_LOOKBACK_DAYS = 30;
const PER_SOURCE_LIMIT = 20;

// See also: lib/admin-dashboard/activity-feed.ts:mergeActivityEvents.
export function mergePlatformEvents(
  lists: PlatformActivityEvent[][],
  limit: number
): PlatformActivityEvent[] {
  const flat: { event: PlatformActivityEvent; idx: number }[] = [];
  let counter = 0;
  for (const list of lists) {
    for (const event of list) flat.push({ event, idx: counter++ });
  }
  flat.sort((a, b) => {
    const diff = b.event.at.getTime() - a.event.at.getTime();
    return diff !== 0 ? diff : a.idx - b.idx;
  });
  return flat.slice(0, limit).map((x) => x.event);
}

export async function getRecentSignups(): Promise<PlatformActivityEvent[]> {
  const rows = await query<SignupRow>`
    SELECT auth_user_id, display_name, full_name, avatar_url, created_at
    FROM profiles
    ORDER BY created_at DESC
    LIMIT ${PER_SOURCE_LIMIT}
  `;
  return rows.map((r) => ({
    type: 'signup' as const,
    at: new Date(r.created_at),
    userId: r.auth_user_id,
    displayName: r.display_name ?? r.full_name ?? 'Anonymous',
    avatarUrl: r.avatar_url,
  }));
}

export async function getRecentCommunities(): Promise<PlatformActivityEvent[]> {
  const rows = await query<CommunityRow>`
    SELECT
      c.created_by,
      p.display_name,
      p.full_name,
      p.avatar_url,
      c.name AS community_name,
      c.slug AS community_slug,
      c.created_at
    FROM communities c
    LEFT JOIN profiles p ON p.auth_user_id = c.created_by
    ORDER BY c.created_at DESC
    LIMIT ${PER_SOURCE_LIMIT}
  `;
  return rows.map((r) => ({
    type: 'community_created' as const,
    at: new Date(r.created_at),
    userId: r.created_by,
    displayName: r.display_name ?? r.full_name ?? 'Anonymous',
    avatarUrl: r.avatar_url,
    communityName: r.community_name,
    communitySlug: r.community_slug,
  }));
}

export async function getRecentAdminActions(): Promise<PlatformActivityEvent[]> {
  const rows = await query<AdminLogRow>`
    SELECT
      l.action,
      l.resource_type,
      p.display_name,
      p.full_name,
      l.created_at
    FROM admin_access_log l
    LEFT JOIN profiles p ON p.id = l.admin_id
    ORDER BY l.created_at DESC
    LIMIT ${PER_SOURCE_LIMIT}
  `;
  return rows.map((r) => ({
    type: 'admin_action' as const,
    at: new Date(r.created_at),
    action: r.action,
    resourceType: r.resource_type ?? '',
    adminName: r.display_name ?? r.full_name,
  }));
}

export async function getRecentFailedPaymentsAcrossPlatform(
  now: Date = new Date()
): Promise<PlatformActivityEvent[]> {
  const sinceSec =
    Math.floor(now.getTime() / 1000) - FEED_LOOKBACK_DAYS * 24 * 60 * 60;

  const accountRows = await query<StripeAccountRow>`
    SELECT stripe_account_id, slug
    FROM communities
    WHERE stripe_account_id IS NOT NULL
  `;

  const perAccount = await Promise.all(
    accountRows.map(async (a) => {
      if (!(await isAccountChargesEnabled(a.stripe_account_id))) {
        return [] as PlatformActivityEvent[];
      }

      const charges = await stripe.charges
        .list(
          { created: { gte: sinceSec }, limit: 100 },
          { stripeAccount: a.stripe_account_id }
        )
        .autoPagingToArray({ limit: 1000 });

      return charges
        .filter((c: Stripe.Charge) => c.status === 'failed')
        .slice(0, PER_SOURCE_LIMIT)
        .map<PlatformActivityEvent>((c) => ({
          type: 'failed_payment' as const,
          at: new Date(c.created * 1000),
          displayName: c.billing_details?.name ?? 'Unknown',
          amount: c.amount / 100,
          communitySlug: a.slug,
        }));
    })
  );

  return perAccount.flat();
}
