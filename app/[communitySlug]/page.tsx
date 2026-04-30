import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import {
  getCommunityBySlug,
  getCommunityThreads,
  getMembershipStatus,
  getUserIsAdmin,
} from '@/lib/community-data';
import FeedClient from './FeedClient';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// Slugs that look like communities but are actually app routes — short-circuit
// before hitting the DB so we don't render a "Community not found" for /admin
// /onboarding etc. when someone lands on them via an unexpected nesting.
const reservedPaths = new Set([
  'admin',
  'discovery',
  'onboarding',
  'login',
  'register',
  'dashboard',
  'api',
  'auth',
  'components',
  'fonts',
  'favicon.ico',
  'globals.css',
  'robots.txt',
  'sitemap.xml',
]);

export default async function CommunityFeedPage({
  params,
}: {
  params: { communitySlug: string };
}) {
  if (reservedPaths.has(params.communitySlug)) notFound();

  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) notFound();

  const session = await getSession();
  if (!session) redirect(`/${params.communitySlug}/about`);

  const [membership, isAdmin] = await Promise.all([
    getMembershipStatus(community.id, session.user.id),
    getUserIsAdmin(session.user.id),
  ]);
  const isCreator = community.created_by === session.user.id;

  // Same gating as the original client-side flow: anyone who isn't a member,
  // pre-registered, creator, or site admin gets bounced to /about.
  if (!membership.isMember && !membership.isPreRegistered && !isCreator && !isAdmin) {
    redirect(`/${params.communitySlug}/about`);
  }

  // Transform DB row to the front-end shape FeedClient already expects
  // (matches what lib/fetcher.ts emits for the 'community:' SWR key).
  const initialCommunity = {
    ...community,
    imageUrl: community.image_url ?? null,
    imageFocalX: community.image_focal_x ?? 50,
    imageFocalY: community.image_focal_y ?? 50,
    imageZoom: Number(community.image_zoom ?? 1),
    threadCategories: community.thread_categories ?? [],
    customLinks: community.custom_links ?? [],
    membershipEnabled: community.membership_enabled ?? false,
    membershipPrice: community.membership_price ?? 0,
    stripeAccountId: community.stripe_account_id ?? null,
    opening_date:
      community.opening_date instanceof Date
        ? community.opening_date.toISOString()
        : community.opening_date ?? null,
  };

  const initialThreads = await getCommunityThreads(community.id);

  return (
    <FeedClient
      communitySlug={params.communitySlug}
      initialCommunity={initialCommunity as never}
      initialThreads={initialThreads as never}
      isCreator={isCreator}
      isAdmin={isAdmin}
      isMember={membership.isMember}
      isPreRegistered={membership.isPreRegistered}
      memberStatus={membership.status}
      subscriptionStatus={membership.subscriptionStatus}
      accessEndDate={membership.currentPeriodEnd}
    />
  );
}
