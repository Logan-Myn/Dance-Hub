import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import {
  getCommunityBySlug,
  getCommunityMembership,
  getUserIsAdmin,
  getCourseWithChapters,
} from '@/lib/community-data';
import CourseDetailClient from './CourseDetailClient';
import { getOfferings, offeringAccess } from '@/lib/offerings';
import { OfferingOffBanner } from '@/components/community-shell/offering-off-banner';
import { communityPath } from '@/lib/safe-redirect';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function CourseDetailPage(
  props: {
    params: Promise<{ communitySlug: string; courseSlug: string }>;
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

  if (!isMember && !isCreator && !isAdmin) {
    redirect(communityPath(params.communitySlug, '/about'));
  }

  const access = offeringAccess(getOfferings(community), 'courses', isCreator || isAdmin);
  if (access === 'redirect') redirect(communityPath(params.communitySlug));

  const initialCourse = await getCourseWithChapters(
    community.id,
    params.courseSlug,
    session.user.id,
  );
  if (!initialCourse) notFound();
  // Drafts are for the owner (and admins) only, even to members who know the URL.
  if (!initialCourse.is_public && !isCreator && !isAdmin) notFound();

  return (
    <>
      {access === 'banner' && <OfferingOffBanner />}
      <CourseDetailClient
        communitySlug={params.communitySlug}
        courseSlug={params.courseSlug}
        community={community as never}
        initialCourse={initialCourse as never}
        isCreator={isCreator}
        isAdmin={isAdmin}
      />
    </>
  );
}
