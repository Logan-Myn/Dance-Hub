import { query, queryOne } from "@/lib/db";
import type { CommunityRow } from "@/lib/community-data";
import { getOfferings } from "@/lib/offerings";
import { REPLAYS_COURSE_SLUG } from "@/lib/classroom/replays";
import { communityPath } from "@/lib/safe-redirect";

export interface SetupItem {
  label: string;
  done: boolean;
  href: string;
}

/** The "Community setup" checklist, from the database. */
export async function getSetup(community: CommunityRow, memberCount: number, now: Date): Promise<SetupItem[]> {
  const offered = getOfferings(community);
  const slug = community.slug;
  const today = now.toISOString().slice(0, 10);
  const r = await queryOne<{ pinned: boolean; course: boolean; live: boolean; slots: boolean }>`
    SELECT
      EXISTS (SELECT 1 FROM threads WHERE community_id = ${community.id} AND pinned = true) AS pinned,
      EXISTS (SELECT 1 FROM courses co JOIN chapters ch ON ch.course_id = co.id JOIN lessons l ON l.chapter_id = ch.id
              WHERE co.community_id = ${community.id} AND co.is_public = true AND co.slug <> ${REPLAYS_COURSE_SLUG}) AS course,
      EXISTS (SELECT 1 FROM live_classes WHERE community_id = ${community.id} AND status = 'scheduled'
              AND scheduled_start_time >= ${now.toISOString()}::timestamptz) AS live,
      EXISTS (SELECT 1 FROM teacher_availability_slots WHERE community_id = ${community.id} AND is_active = true
              AND availability_date >= ${today}::date) AS slots
  `;
  const paid = !!community.membership_enabled && Number(community.membership_price ?? 0) > 0;
  const admin = (p: string) => communityPath(slug, `/admin${p}`);
  return [
    { label: "Cover image", done: !!community.image_url, href: admin("/general") },
    ...(paid || offered.privateLessons ? [{ label: "Payouts connected", done: !!community.stripe_account_id, href: admin("/subscriptions") }] : []),
    { label: "A welcome post pinned", done: !!r?.pinned, href: communityPath(slug) },
    ...(offered.courses ? [{ label: "A course published", done: !!r?.course, href: communityPath(slug, "/classroom") }] : []),
    ...(offered.liveClasses ? [{ label: "A live class scheduled", done: !!r?.live, href: communityPath(slug, "/calendar") }] : []),
    ...(offered.privateLessons ? [{ label: "Open times for private lessons", done: !!r?.slots, href: communityPath(slug, "/private-lessons") }] : []),
    { label: "About page written", done: !!community.about_page, href: `${communityPath(slug, "/about")}?edit=1` },
    { label: "First 10 members", done: memberCount >= 10, href: admin("/members") },
  ];
}

export interface UpcomingItem {
  kind: "live" | "lesson";
  id: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
  detail: string | null;
  href: string;
}

/** Live classes and booked private lessons in the next 7 days. */
export async function getNextSevenDays(community: CommunityRow, now: Date): Promise<UpcomingItem[]> {
  const offered = getOfferings(community);
  const from = now.toISOString();
  const to = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const [classes, lessons] = await Promise.all([
    offered.liveClasses
      ? query<{ id: string; title: string; starts_at: string; duration_minutes: number }>`
          SELECT id, title, scheduled_start_time::text AS starts_at, duration_minutes
          FROM live_classes
          WHERE community_id = ${community.id} AND status = 'scheduled'
            AND scheduled_start_time >= ${from}::timestamptz AND scheduled_start_time < ${to}::timestamptz
          ORDER BY scheduled_start_time LIMIT 8
        `
      : Promise.resolve([]),
    query<{ id: string; title: string; starts_at: string; duration_minutes: number; student_name: string | null; price_paid: string | number | null }>`
      SELECT lb.id, pl.title, lb.scheduled_at::text AS starts_at, pl.duration_minutes, lb.student_name, lb.price_paid
      FROM lesson_bookings lb JOIN private_lessons pl ON pl.id = lb.private_lesson_id
      WHERE lb.community_id = ${community.id} AND lb.payment_status = 'succeeded' AND lb.lesson_status <> 'canceled'
        AND lb.scheduled_at >= ${from}::timestamptz AND lb.scheduled_at < ${to}::timestamptz
      ORDER BY lb.scheduled_at LIMIT 8
    `,
  ]);
  const items: UpcomingItem[] = [
    ...classes.map((c) => ({
      kind: "live" as const,
      id: c.id,
      title: c.title,
      startsAt: new Date(c.starts_at).toISOString(),
      durationMinutes: c.duration_minutes,
      detail: null,
      href: communityPath(community.slug, "/calendar"),
    })),
    ...lessons.map((l) => ({
      kind: "lesson" as const,
      id: l.id,
      title: l.student_name ? `${l.title} with ${l.student_name}` : l.title,
      startsAt: new Date(l.starts_at).toISOString(),
      durationMinutes: l.duration_minutes,
      detail: l.price_paid != null ? `Paid €${Number(l.price_paid).toFixed(Number(l.price_paid) % 1 ? 2 : 0)}` : null,
      href: communityPath(community.slug, "/private-lessons"),
    })),
  ];
  return items.sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 8);
}

export interface BookingEvent {
  id: string;
  at: string;
  studentName: string;
  lessonTitle: string;
  pricePaid: number;
}

/** Recent private lesson bookings, for the activity list. */
export async function getRecentBookings(communityId: string): Promise<BookingEvent[]> {
  const rows = await query<{ id: string; created_at: string; student_name: string | null; title: string; price_paid: string | number | null }>`
    SELECT lb.id, lb.created_at::text AS created_at, lb.student_name, pl.title, lb.price_paid
    FROM lesson_bookings lb JOIN private_lessons pl ON pl.id = lb.private_lesson_id
    WHERE lb.community_id = ${communityId} AND lb.payment_status = 'succeeded'
    ORDER BY lb.created_at DESC LIMIT 10
  `;
  return rows.map((r) => ({
    id: r.id,
    at: new Date(r.created_at).toISOString(),
    studentName: r.student_name || "Someone",
    lessonTitle: r.title,
    pricePaid: Number(r.price_paid ?? 0),
  }));
}
