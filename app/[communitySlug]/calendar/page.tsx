import { notFound, redirect } from 'next/navigation';
import { communityPath } from '@/lib/safe-redirect';
import { getOfferings, offeringAccess } from '@/lib/offerings';
import { OfferingOffBanner } from '@/components/community-shell/offering-off-banner';
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';
import {
  getCommunityBySlug,
  getCommunityMembership,
  getPublicProfile,
  getUserIsAdmin,
} from '@/lib/community-data';
import { getCalendarItems } from '@/lib/calendar/data';
import { REPLAYS_COURSE_SLUG } from '@/lib/classroom/replays';
import CalendarClient from './CalendarClient';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const DAY = 86_400_000;

// The moment this request renders; the calendar's clock starts here.
function requestTime(): number {
  return Date.now();
}

/** A saved zone of 'UTC' is the column default, so it usually means "not chosen". */
const chosenZone = (tz: string | null | undefined) => (tz && tz !== 'UTC' ? tz : null);

export default async function CommunityCalendarPage(
  props: {
    params: Promise<{ communitySlug: string }>;
  }
) {
  const params = await props.params;
  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) notFound();

  // Members, the owner and site admins (same rule as the Calendar tab).
  const session = await getSession();
  if (!session) redirect(communityPath(params.communitySlug, '/about'));
  const [isMember, isAdmin] = await Promise.all([
    getCommunityMembership(community.id, session.user.id),
    getUserIsAdmin(session.user.id),
  ]);
  const isCreator = community.created_by === session.user.id;
  if (!isMember && !isCreator && !isAdmin) redirect(communityPath(params.communitySlug, '/about'));

  const offerings = getOfferings(community);
  const access = offeringAccess(offerings, 'liveClasses', isCreator || isAdmin);
  if (access === 'redirect') redirect(communityPath(params.communitySlug));

  // Two weeks back (past classes and replays) to two months ahead: covers the
  // current week in every time zone and the whole list view.
  const now = requestTime();
  const range = { start: new Date(now - 15 * DAY).toISOString(), end: new Date(now + 60 * DAY).toISOString() };
  const replays = await queryOne<{ is_public: boolean | null }>`
    SELECT is_public FROM courses WHERE community_id = ${community.id} AND slug = ${REPLAYS_COURSE_SLUG}
  `;
  const [items, owner, viewer] = await Promise.all([
    getCalendarItems({
      communityId: community.id,
      viewerId: session.user.id,
      start: range.start,
      end: range.end,
      includeReplays: offerings.courses && !!replays && (isCreator || isAdmin || replays.is_public !== false),
      includeLessons: offerings.privateLessons,
    }),
    getPublicProfile(community.created_by),
    getPublicProfile(session.user.id),
  ]);

  return (
    <>
      {access === 'banner' && <OfferingOffBanner slug={params.communitySlug} />}
      <CalendarClient
        slug={params.communitySlug}
        teacherName={owner?.name ?? 'the teacher'}
        isOwner={isCreator}
        lessonsOn={offerings.privateLessons}
        initialItems={items}
        initialRange={range}
        serverNow={now}
        viewerZone={chosenZone(viewer?.timezone)}
        classZone={chosenZone(owner?.timezone)}
      />
    </>
  );
}
