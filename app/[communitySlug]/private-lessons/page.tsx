import { notFound, redirect } from 'next/navigation';
import { communityPath } from '@/lib/safe-redirect';
import { getOfferings, offeringAccess } from '@/lib/offerings';
import { OfferingOffBanner } from '@/components/community-shell/offering-off-banner';
import { getSession } from '@/lib/auth-session';
import {
  getActivePrivateLessons,
  getCommunityBySlug,
  getCommunityMembership,
  getPublicProfile,
  getUserIsAdmin,
} from '@/lib/community-data';
import { getOpenSlots, getOwnerBookings, getViewerBookings } from '@/lib/private-lessons/data';
import type { LessonType } from '@/components/community-lessons/types';
import LessonsClient from './LessonsClient';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// The moment this request renders; the page's clock starts here.
function requestTime(): number {
  return Date.now();
}

const chosenZone = (tz: string | null | undefined) => (tz && tz !== 'UTC' ? tz : null);

export default async function CommunityPrivateLessonsPage(
  props: {
    params: Promise<{ communitySlug: string }>;
  }
) {
  const params = await props.params;
  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) notFound();

  const session = await getSession();
  const isCreator = !!session && community.created_by === session.user.id;
  const [isMember, isAdmin] = session
    ? await Promise.all([getCommunityMembership(community.id, session.user.id), getUserIsAdmin(session.user.id)])
    : [false, false];

  const access = offeringAccess(getOfferings(community), 'privateLessons', isCreator || isAdmin);
  if (access === 'redirect') redirect(communityPath(params.communitySlug));

  // Owners see hidden lessons too (marked Hidden).
  const now = requestTime();
  const raw = await getActivePrivateLessons(community.id, isCreator);
  const lessons: LessonType[] = raw.map((l) => ({
    id: l.id,
    title: l.title,
    description: l.description ?? null,
    durationMinutes: l.duration_minutes,
    regularPrice: l.regular_price,
    memberPrice: l.member_price ?? null,
    discountPercent: l.member_discount_percentage ?? null,
    locationType: l.location_type,
    requirements: l.requirements ?? null,
    maxPerMonth: l.max_bookings_per_month ?? null,
    cutoffHours: l.cancellation_cutoff_hours,
    latePolicy: l.late_refund_policy,
    isActive: l.is_active,
    teacherId: l.teacher_id || community.created_by,
  }));
  const teacherIds = Array.from(new Set(lessons.filter((l) => l.isActive || isCreator).map((l) => l.teacherId)));

  const [teacher, viewerProfile, slots, myBookings, ownerBookings] = await Promise.all([
    getPublicProfile(community.created_by),
    session ? getPublicProfile(session.user.id) : Promise.resolve(null),
    getOpenSlots(community.id, teacherIds, new Date(now)),
    session && !isCreator ? getViewerBookings(community.id, session.user.id) : Promise.resolve([]),
    isCreator ? getOwnerBookings(community.id) : Promise.resolve([]),
  ]);

  return (
    <>
      {access === 'banner' && <OfferingOffBanner />}
      <LessonsClient
        slug={params.communitySlug}
        teacher={{
          id: community.created_by,
          name: teacher?.name ?? 'the teacher',
          avatarUrl: teacher?.avatarUrl ?? null,
          timezone: chosenZone(teacher?.timezone),
        }}
        isOwner={isCreator}
        isMember={isMember}
        signedIn={!!session}
        viewer={session ? { name: viewerProfile?.name ?? session.user.name ?? '', email: session.user.email } : null}
        viewerZone={chosenZone(viewerProfile?.timezone)}
        lessons={lessons}
        slots={slots}
        myBookings={myBookings}
        ownerBookings={ownerBookings}
        payoutsReady={!!community.stripe_account_id}
        membershipPrice={community.membership_enabled ? Number(community.membership_price ?? 0) : null}
        serverNow={now}
      />
    </>
  );
}
