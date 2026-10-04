import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import {
  getActivePrivateLessons,
  getCommunityBySlug,
  getCommunityThreads,
  getCourseProgress,
  getFeedVisit,
  getMembershipStatus,
  getPublicProfile,
  getRosterCount,
  getUpcomingClasses,
  getUserIsAdmin,
} from '@/lib/community-data';
import { feedVisitBaseline } from '@/lib/feed/visits';
import { getOfferings } from '@/lib/offerings';
import { communityPath } from '@/lib/safe-redirect';
import type { FeedCommunity, FeedLesson } from '@/components/community-feed/types';
import type { ThreadCategory } from '@/types/community';
import FeedClient from './FeedClient';

// The moment this request renders; the feed's clock starts here.
function requestTime(): number {
  return Date.now();
}

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

export default async function CommunityFeedPage(
  props: {
    params: Promise<{ communitySlug: string }>;
  }
) {
  const params = await props.params;
  if (reservedPaths.has(params.communitySlug)) notFound();

  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) notFound();

  const session = await getSession();
  if (!session) redirect(communityPath(params.communitySlug, '/about'));

  const [membership, isAdmin, initialMemberCount] = await Promise.all([
    getMembershipStatus(community.id, session.user.id),
    getUserIsAdmin(session.user.id),
    getRosterCount(community.id),
  ]);
  const isCreator = community.created_by === session.user.id;

  // Same gating as the original client-side flow: anyone who isn't a member,
  // pre-registered, creator, or site admin gets bounced to /about.
  if (!membership.isMember && !membership.isPreRegistered && !isCreator && !isAdmin) {
    redirect(communityPath(params.communitySlug, '/about'));
  }

  const offerings = getOfferings(community);
  const canSeePrivate = isCreator || isAdmin;
  const [initialThreads, visit, viewerProfile, ownerProfile, upcomingClasses, courseProgress, privateLessons] =
    await Promise.all([
      getCommunityThreads(community.id),
      getFeedVisit(community.id, session.user.id),
      getPublicProfile(session.user.id),
      getPublicProfile(community.created_by),
      offerings.liveClasses ? getUpcomingClasses(community.id, 2) : Promise.resolve([]),
      offerings.courses ? getCourseProgress(community.id, session.user.id, canSeePrivate) : Promise.resolve(null),
      offerings.privateLessons ? getActivePrivateLessons(community.id) : Promise.resolve([]),
    ]);

  const now = requestTime();
  const feedCommunity: FeedCommunity = {
    id: community.id,
    slug: community.slug,
    name: community.name,
    description: community.description,
    createdBy: community.created_by,
    imageUrl: community.image_url ?? null,
    imageFocalX: community.image_focal_x ?? 50,
    imageFocalY: community.image_focal_y ?? 50,
    imageZoom: Number(community.image_zoom ?? 1),
    categories: (Array.isArray(community.thread_categories) ? community.thread_categories : []) as ThreadCategory[],
    customLinks: (Array.isArray(community.custom_links) ? community.custom_links : []) as FeedCommunity['customLinks'],
    membershipEnabled: community.membership_enabled ?? false,
    membershipPrice: Number(community.membership_price ?? 0),
    yearlyEnabled: community.yearly_enabled ?? false,
    stripeAccountId: community.stripe_account_id ?? null,
    status: community.status ?? null,
    openingDate:
      community.opening_date instanceof Date ? community.opening_date.toISOString() : community.opening_date ?? null,
  };
  const lessons: FeedLesson[] = privateLessons
    .map((l) => ({
      id: l.id,
      title: l.title,
      durationMinutes: l.duration_minutes,
      locationType: l.location_type,
      regularPrice: l.regular_price,
      memberPrice: l.member_price ?? null,
    }))
    .sort((a, b) => (a.memberPrice ?? a.regularPrice) - (b.memberPrice ?? b.regularPrice))
    .slice(0, 2);

  return (
    <FeedClient
      community={feedCommunity}
      initialThreads={initialThreads}
      viewer={{
        id: session.user.id,
        name: viewerProfile?.name || session.user.name || 'Member',
        avatarUrl: viewerProfile?.avatarUrl ?? session.user.image ?? null,
        timezone: viewerProfile?.timezone ?? null,
      }}
      owner={{ id: community.created_by, name: ownerProfile?.name || 'Teacher', avatarUrl: ownerProfile?.avatarUrl ?? null }}
      offerings={offerings}
      isCreator={isCreator}
      isAdmin={isAdmin}
      isMember={membership.isMember}
      isPreRegistered={membership.isPreRegistered}
      memberStatus={membership.status}
      subscriptionStatus={membership.subscriptionStatus}
      accessEndDate={membership.currentPeriodEnd}
      initialMemberCount={initialMemberCount}
      newSince={feedVisitBaseline(visit.feedVisitAt, visit.feedPrevVisitAt, new Date(now))}
      serverNow={now}
      upcomingClasses={upcomingClasses}
      courseProgress={courseProgress}
      lessons={lessons}
    />
  );
}
