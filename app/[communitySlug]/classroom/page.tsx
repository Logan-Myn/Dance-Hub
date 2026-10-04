import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import {
  getCommunityBySlug,
  getCommunityMembership,
  getPublicProfile,
  getRosterCount,
  getUserIsAdmin,
} from '@/lib/community-data';
import { getClassroomOverview } from '@/lib/classroom/data';
import ClassroomPageClient from './ClassroomPageClient';
import { getOfferings, offeringAccess } from '@/lib/offerings';
import { OfferingOffBanner } from '@/components/community-shell/offering-off-banner';
import { communityPath } from '@/lib/safe-redirect';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function ClassroomPage(
  props: {
    params: Promise<{ communitySlug: string }>;
  }
) {
  const params = await props.params;
  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) notFound();

  const session = await getSession();
  if (!session) redirect(communityPath(params.communitySlug, '/about'));

  const [isMember, isAdmin] = await Promise.all([
    getCommunityMembership(community.id, session.user.id),
    getUserIsAdmin(session.user.id),
  ]);
  const isCreator = community.created_by === session.user.id;

  // Same gating as the original client-side flow: anyone who's not a member,
  // creator, or site admin gets bounced to /about.
  if (!isMember && !isCreator && !isAdmin) {
    redirect(communityPath(params.communitySlug, '/about'));
  }

  const offerings = getOfferings(community);
  const access = offeringAccess(offerings, 'courses', isCreator || isAdmin);
  if (access === 'redirect') redirect(communityPath(params.communitySlug));

  const canManage = isCreator || isAdmin;
  const [overview, memberCount, owner, viewer] = await Promise.all([
    getClassroomOverview(community.id, session.user.id, canManage),
    getRosterCount(community.id),
    getPublicProfile(community.created_by),
    getPublicProfile(session.user.id),
  ]);

  return (
    <>
      {access === 'banner' && <OfferingOffBanner />}
      <ClassroomPageClient
        communitySlug={params.communitySlug}
        teacherName={owner?.name ?? 'the teacher'}
        canManage={canManage}
        isCreator={isCreator}
        overview={overview}
        memberCount={memberCount}
        liveClassesOn={offerings.liveClasses}
        viewerTimeZone={viewer?.timezone ?? null}
      />
    </>
  );
}
