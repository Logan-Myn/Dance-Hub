import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import {
  getCommunityBySlug,
  getCommunityMembership,
  getUserIsAdmin,
  getCoursesForCommunity,
} from '@/lib/community-data';
import ClassroomPageClient from './ClassroomPageClient';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function ClassroomPage({
  params,
}: {
  params: { communitySlug: string };
}) {
  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) notFound();

  const session = await getSession();
  if (!session) redirect(`/${params.communitySlug}/about`);

  const [isMember, isAdmin] = await Promise.all([
    getCommunityMembership(community.id, session.user.id),
    getUserIsAdmin(session.user.id),
  ]);
  const isCreator = community.created_by === session.user.id;

  // Same gating as the original client-side flow: anyone who's not a member,
  // creator, or site admin gets bounced to /about.
  if (!isMember && !isCreator && !isAdmin) {
    redirect(`/${params.communitySlug}/about`);
  }

  const initialCourses = await getCoursesForCommunity(community.id, isCreator || isAdmin);

  return (
    <ClassroomPageClient
      communitySlug={params.communitySlug}
      communityId={community.id}
      isCreator={isCreator}
      isAdmin={isAdmin}
      initialCourses={initialCourses}
    />
  );
}
