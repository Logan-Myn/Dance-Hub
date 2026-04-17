import { notFound } from 'next/navigation';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { getSession } from '@/lib/auth-session';
import {
  getCommunityBySlug,
  getLiveClassesForWeek,
} from '@/lib/community-data';
import WeekCalendar from '@/components/WeekCalendar';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function CommunityCalendarPage({
  params,
}: {
  params: { communitySlug: string };
}) {
  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) notFound();

  const session = await getSession();
  const isCreator = !!session && community.created_by === session.user.id;

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 0 });
  const initialClasses = await getLiveClassesForWeek(
    community.id,
    format(weekStart, 'yyyy-MM-dd'),
    format(weekEnd, 'yyyy-MM-dd'),
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
        isTeacher={isCreator}
        initialClasses={initialClasses}
      />
    </div>
  );
}
