import { notFound, redirect } from 'next/navigation';
import { communityPath } from '@/lib/safe-redirect';
import { getOfferings, offeringAccess } from '@/lib/offerings';
import { OfferingOffBanner } from '@/components/community-shell/offering-off-banner';
import { getSession } from '@/lib/auth-session';
import {
  getCommunityBySlug,
  getLiveClassesInRange,
  getUserIsAdmin,
} from '@/lib/community-data';
import { initialCalendarRange } from '@/lib/calendar-week';
import WeekCalendar from '@/components/WeekCalendar';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function CommunityCalendarPage(
  props: {
    params: Promise<{ communitySlug: string }>;
  }
) {
  const params = await props.params;
  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) notFound();

  const session = await getSession();
  const isCreator = !!session && community.created_by === session.user.id;
  const isAdmin = !!session && (await getUserIsAdmin(session.user.id));

  const access = offeringAccess(getOfferings(community), 'liveClasses', isCreator || isAdmin);
  if (access === 'redirect') redirect(communityPath(params.communitySlug));

  // The server doesn't know the viewer's timezone, so pre-fetch a window
  // that holds the current week in every timezone; the calendar trims it.
  const range = initialCalendarRange(new Date());
  const initialRange = { start: range.start.toISOString(), end: range.end.toISOString() };
  const initialClasses = await getLiveClassesInRange(
    community.id,
    initialRange.start,
    initialRange.end,
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {access === 'banner' && <OfferingOffBanner />}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          {community.name} Calendar
        </h1>
        <p className="mt-2 text-gray-600">
          View and join scheduled live dance classes
        </p>
      </div>

      <WeekCalendar
        communityId={community.id}
        communitySlug={params.communitySlug}
        isTeacher={isCreator || isAdmin}
        initialClasses={initialClasses}
        initialRange={initialRange}
      />
    </div>
  );
}
