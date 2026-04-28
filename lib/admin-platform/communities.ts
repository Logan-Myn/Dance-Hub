import { query } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';

export interface AdminCommunityRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  createdAt: Date;
  membershipEnabled: boolean;
  membershipPrice: number | null;
  stripeAccountId: string | null;
  creator: {
    fullName: string | null;
    email: string;
  };
  membersCount: number;
  totalRevenue: number;
  platformFees: number;
}

interface CommunityRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  created_at: Date;
  created_by: string;
  membership_enabled: boolean;
  membership_price: number | null;
  stripe_account_id: string | null;
}

interface CreatorRow {
  auth_user_id: string;
  full_name: string | null;
  email: string;
}

interface MemberCountRow {
  community_id: string;
  count: number;
}

export async function getAllAdminCommunities(): Promise<AdminCommunityRow[]> {
  const communities = await query<CommunityRow>`
    SELECT id, name, slug, description, image_url, created_at, created_by,
           membership_enabled, membership_price, stripe_account_id
    FROM communities
    ORDER BY created_at DESC
  `;
  if (communities.length === 0) return [];

  const creatorIds = Array.from(new Set(communities.map((c) => c.created_by)));
  const communityIds = communities.map((c) => c.id);

  const [creators, memberCounts] = await Promise.all([
    query<CreatorRow>`
      SELECT auth_user_id, full_name, email
      FROM profiles
      WHERE auth_user_id = ANY(${creatorIds})
    `,
    query<MemberCountRow>`
      SELECT community_id, COUNT(*)::int AS count
      FROM community_members
      WHERE community_id = ANY(${communityIds})
        AND status = 'active'
      GROUP BY community_id
    `,
  ]);

  const creatorMap = new Map(creators.map((c) => [c.auth_user_id, c]));
  const memberCountMap = new Map(memberCounts.map((m) => [m.community_id, m.count]));

  const platformFeesByAccount = await getPlatformFeesByAccount();

  const revenueByAccount = await getRevenueByAccount(
    communities
      .map((c) => c.stripe_account_id)
      .filter((id): id is string => Boolean(id))
  );

  return communities.map((c) => {
    const creator = creatorMap.get(c.created_by);
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      imageUrl: c.image_url,
      createdAt: new Date(c.created_at),
      membershipEnabled: c.membership_enabled,
      membershipPrice: c.membership_price,
      stripeAccountId: c.stripe_account_id,
      creator: {
        fullName: creator?.full_name ?? null,
        email: creator?.email ?? '',
      },
      membersCount: memberCountMap.get(c.id) ?? 0,
      totalRevenue: c.stripe_account_id
        ? revenueByAccount.get(c.stripe_account_id) ?? 0
        : 0,
      platformFees: c.stripe_account_id
        ? platformFeesByAccount.get(c.stripe_account_id) ?? 0
        : 0,
    };
  });
}

async function getPlatformFeesByAccount(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const fees = await stripe.applicationFees
      .list({ limit: 100 })
      .autoPagingToArray({ limit: 5000 });
    for (const fee of fees) {
      const accountId =
        typeof fee.account === 'string' ? fee.account : fee.account.id;
      map.set(accountId, (map.get(accountId) ?? 0) + fee.amount / 100);
    }
  } catch (error) {
    console.error('Error fetching platform application fees:', error);
  }
  return map;
}

async function getRevenueByAccount(
  accountIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (accountIds.length === 0) return map;

  await Promise.all(
    accountIds.map(async (id) => {
      try {
        const account = await stripe.accounts.retrieve(id);
        if (!account.charges_enabled) {
          map.set(id, 0);
          return;
        }
        const charges = await stripe.charges
          .list({ limit: 100 }, { stripeAccount: id })
          .autoPagingToArray({ limit: 5000 });
        const total = charges
          .filter((c: Stripe.Charge) => c.status === 'succeeded')
          .reduce((sum, c) => sum + c.amount / 100, 0);
        map.set(id, total);
      } catch (error) {
        console.error(`Error fetching revenue for account ${id}:`, error);
        map.set(id, 0);
      }
    })
  );
  return map;
}
