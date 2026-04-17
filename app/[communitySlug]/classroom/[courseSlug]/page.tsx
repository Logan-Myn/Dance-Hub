import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import {
  getCommunityBySlug,
  getCommunityMembership,
  getUserIsAdmin,
  getCourseWithChapters,
} from '@/lib/community-data';
import CourseDetailClient from './CourseDetailClient';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function CourseDetailPage({
  params,
}: {
  params: { communitySlug: string; courseSlug: string };
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

  if (!isMember && !isCreator && !isAdmin) {
    redirect(`/${params.communitySlug}/about`);
  }

  const initialCourse = await getCourseWithChapters(
    community.id,
    params.courseSlug,
    session.user.id,
  );
  if (!initialCourse) notFound();

  return (
    <CourseDetailClient
      communitySlug={params.communitySlug}
      courseSlug={params.courseSlug}
      community={community as never}
      initialCourse={initialCourse as never}
      isCreator={isCreator}
      isAdmin={isAdmin}
    />
  );
}
