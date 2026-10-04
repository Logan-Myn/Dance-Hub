import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import {
  getCommunityBySlug,
  getCommunityMembership,
  getCourseWithChapters,
  getUserIsAdmin,
} from '@/lib/community-data';
import { getClassroomOverview } from '@/lib/classroom/data';
import { redactForPreview } from '@/lib/classroom/model';
import { REPLAYS_COURSE_SLUG, replayTitle } from '@/lib/classroom/replays';
import CourseDetailClient from './CourseDetailClient';
import { getOfferings, offeringAccess } from '@/lib/offerings';
import { OfferingOffBanner } from '@/components/community-shell/offering-off-banner';
import { communityPath } from '@/lib/safe-redirect';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function CourseDetailPage(
  props: {
    params: Promise<{ communitySlug: string; courseSlug: string }>;
    searchParams: Promise<{ lesson?: string }>;
  }
) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) notFound();

  const session = await getSession();
  const [isMember, isAdmin] = session
    ? await Promise.all([
        getCommunityMembership(community.id, session.user.id),
        getUserIsAdmin(session.user.id),
      ])
    : [false, false];
  const isCreator = !!session && community.created_by === session.user.id;
  const insider = isMember || isCreator || isAdmin;
  const offerings = getOfferings(community);

  // Visitors (signed out or not members) may open a published course that has
  // free preview lessons; everything else is members only.
  if (!insider) {
    if (!offerings.courses) redirect(communityPath(params.communitySlug, '/about'));
    const course = await getCourseWithChapters(community.id, params.courseSlug, null);
    const hasPreview = !!course?.is_public && course.chapters.some((c) => c.lessons.some((l) => (l as { is_preview?: boolean }).is_preview));
    if (!course || !hasPreview || course.slug === REPLAYS_COURSE_SLUG) {
      redirect(communityPath(params.communitySlug, '/about'));
    }
    const redacted = {
      ...course,
      chapters: course.chapters.map((c) => ({ ...c, lessons: c.lessons.map((l) => redactForPreview(l)) })),
    };
    return (
      <CourseDetailClient
        communitySlug={params.communitySlug}
        courseSlug={params.courseSlug}
        community={{ id: community.id, name: community.name, created_by: community.created_by }}
        initialCourse={redacted as never}
        isCreator={false}
        isAdmin={false}
        mode="preview"
        initialLessonId={searchParams.lesson ?? null}
        isReplays={false}
        nextCourse={null}
        searchIndex={[]}
      />
    );
  }

  const access = offeringAccess(offerings, 'courses', isCreator || isAdmin);
  if (access === 'redirect') redirect(communityPath(params.communitySlug));

  const [initialCourse, overview] = await Promise.all([
    getCourseWithChapters(community.id, params.courseSlug, session!.user.id),
    getClassroomOverview(community.id, session!.user.id, isCreator || isAdmin),
  ]);
  if (!initialCourse) notFound();
  // Drafts are for the owner (and admins) only, even to members who know the URL.
  if (!initialCourse.is_public && !isCreator && !isAdmin) notFound();

  // "Start {next course}" on the finish card: the next course not done yet.
  const next = overview.courses.find(
    (c) => c.slug !== initialCourse.slug && c.isPublic && c.status !== 'done' && c.lessonCount > 0
  );
  const isReplays = initialCourse.slug === REPLAYS_COURSE_SLUG;
  const course = isReplays
    ? {
        ...initialCourse,
        chapters: initialCourse.chapters.map((c) => ({
          ...c,
          lessons: c.lessons.map((l) => ({ ...l, title: replayTitle(l.title) })),
        })),
      }
    : initialCourse;

  return (
    <>
      {access === 'banner' && <OfferingOffBanner />}
      <CourseDetailClient
        communitySlug={params.communitySlug}
        courseSlug={params.courseSlug}
        community={{ id: community.id, name: community.name, created_by: community.created_by }}
        initialCourse={course as never}
        isCreator={isCreator}
        isAdmin={isAdmin}
        mode="member"
        initialLessonId={searchParams.lesson ?? null}
        isReplays={isReplays}
        nextCourse={next ? { slug: next.slug, title: next.title } : null}
        searchIndex={overview.lessons}
      />
    </>
  );
}
