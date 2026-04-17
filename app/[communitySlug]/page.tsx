import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import {
  getCommunityBySlug,
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

  return (
    <FeedClient
      communitySlug={params.communitySlug}
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
