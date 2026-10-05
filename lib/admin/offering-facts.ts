import { queryOne } from "@/lib/db";
import { REPLAYS_COURSE_SLUG } from "@/lib/classroom/replays";

export interface OfferingFacts {
  live: { scheduled: number; nextAt: string | null; replays: number };
  courses: { published: number; hidden: number; started: number };
  lessons: { types: number; openTimes: number; bookedThisMonth: number };
}

/** A few numbers per offering, for the switches in Admin, Offerings. */
export async function getOfferingFacts(communityId: string, now: Date): Promise<OfferingFacts> {
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  const monthStart = `${nowIso.slice(0, 7)}-01`;
  const r = await queryOne<{
    scheduled: number;
    next_at: string | null;
    replays: number;
    published: number;
    hidden: number;
    started: number;
    types: number;
    open_times: number;
    booked: number;
  }>`
    SELECT
      (SELECT COUNT(*)::int FROM live_classes
         WHERE community_id = ${communityId} AND status = 'scheduled' AND scheduled_start_time >= ${nowIso}::timestamptz) AS scheduled,
      (SELECT MIN(scheduled_start_time)::text FROM live_classes
         WHERE community_id = ${communityId} AND status = 'scheduled' AND scheduled_start_time >= ${nowIso}::timestamptz) AS next_at,
      (SELECT COUNT(l.id)::int FROM lessons l JOIN chapters ch ON ch.id = l.chapter_id JOIN courses co ON co.id = ch.course_id
         WHERE co.community_id = ${communityId} AND co.slug = ${REPLAYS_COURSE_SLUG}) AS replays,
      (SELECT COUNT(*)::int FROM courses
         WHERE community_id = ${communityId} AND slug <> ${REPLAYS_COURSE_SLUG} AND is_public = true) AS published,
      (SELECT COUNT(*)::int FROM courses
         WHERE community_id = ${communityId} AND slug <> ${REPLAYS_COURSE_SLUG} AND is_public IS NOT TRUE) AS hidden,
      (SELECT COUNT(DISTINCT lc.user_id)::int FROM lesson_completions lc
         JOIN lessons l ON l.id = lc.lesson_id JOIN chapters ch ON ch.id = l.chapter_id JOIN courses co ON co.id = ch.course_id
         WHERE co.community_id = ${communityId} AND co.slug <> ${REPLAYS_COURSE_SLUG}) AS started,
      (SELECT COUNT(*)::int FROM private_lessons WHERE community_id = ${communityId} AND is_active = true) AS types,
      (SELECT COUNT(*)::int FROM teacher_availability_slots tas
         WHERE tas.community_id = ${communityId} AND tas.is_active = true AND tas.availability_date >= ${today}::date
           AND NOT EXISTS (SELECT 1 FROM lesson_bookings lb WHERE lb.availability_slot_id = tas.id AND lb.lesson_status <> 'canceled')) AS open_times,
      (SELECT COUNT(*)::int FROM lesson_bookings
         WHERE community_id = ${communityId} AND payment_status = 'succeeded' AND created_at >= ${monthStart}::date) AS booked
  `;
  return {
    live: { scheduled: r?.scheduled ?? 0, nextAt: r?.next_at ?? null, replays: r?.replays ?? 0 },
    courses: { published: r?.published ?? 0, hidden: r?.hidden ?? 0, started: r?.started ?? 0 },
    lessons: { types: r?.types ?? 0, openTimes: r?.open_times ?? 0, bookedThisMonth: r?.booked ?? 0 },
  };
}
