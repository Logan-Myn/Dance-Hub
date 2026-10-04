import { cache } from "react";
import { query, queryOne } from "@/lib/db";
import { getActivePrivateLessons, getRosterCount, getUpcomingClasses, type UpcomingClass } from "@/lib/community-data";
import { realCoverUrl } from "@/lib/classroom/model";
import { REPLAYS_COURSE_SLUG } from "@/lib/classroom/replays";
import { getOpenSlots } from "@/lib/private-lessons/data";
import type { LatePolicy } from "@/lib/private-lessons/policy";
import type { Offered } from "./model";

export interface AboutCourse {
  slug: string;
  title: string;
  description: string;
  coverUrl: string | null;
  lessonCount: number;
  chapters: Array<{ title: string; lessons: number }>;
  previewLessonId: string | null;
  replayCount: number;
}

export interface AboutLesson {
  id: string;
  title: string;
  durationMinutes: number;
  regularPrice: number;
  memberPrice: number | null;
  nextFree: string | null;
  cutoffHours: number;
  latePolicy: LatePolicy;
}

export interface AboutData {
  memberCount: number;
  upcoming: UpcomingClass[];
  course: AboutCourse | null;
  courseCount: number;
  lessons: AboutLesson[];
  activity: { posts30: number; replies30: number; topics: Array<{ name: string; color: string; count: number }> };
}

/** Everything the automatic blocks show, skipping switched-off offerings. */
export const getAboutData = cache(async (
  community: { id: string; created_by: string; thread_categories?: unknown },
  offered: Offered,
  now: Date,
): Promise<AboutData> => {
  const [memberCount, upcoming, courseRows, lessonRows, activity] = await Promise.all([
    getRosterCount(community.id),
    offered.liveClasses ? getUpcomingClasses(community.id, 4) : Promise.resolve([] as UpcomingClass[]),
    offered.courses
      ? query<{ id: string; slug: string; title: string; description: string | null; image_url: string | null; chapter_title: string | null; lessons: number; preview_id: string | null }>`
          SELECT co.id, co.slug, co.title, co.description, co.image_url, ch.title AS chapter_title,
                 COUNT(l.id)::int AS lessons,
                 (array_agg(l.id ORDER BY l.lesson_position) FILTER (WHERE l.is_preview))[1] AS preview_id
          FROM courses co
          LEFT JOIN chapters ch ON ch.course_id = co.id
          LEFT JOIN lessons l ON l.chapter_id = ch.id
          WHERE co.community_id = ${community.id} AND co.is_public = true
          GROUP BY co.id, ch.id
          ORDER BY co.created_at DESC, ch.chapter_position
        `
      : Promise.resolve([]),
    offered.privateLessons ? getActivePrivateLessons(community.id) : Promise.resolve([]),
    queryOne<{ posts30: number; replies30: number }>`
      SELECT
        (SELECT COUNT(*)::int FROM threads WHERE community_id = ${community.id} AND created_at > NOW() - INTERVAL '30 days') AS posts30,
        (SELECT COUNT(*)::int FROM comments c JOIN threads t ON t.id = c.thread_id
           WHERE t.community_id = ${community.id} AND c.created_at > NOW() - INTERVAL '30 days') AS replies30
    `,
  ]);

  // Courses: the newest published one with lessons is the preview; replays count separately.
  const byCourse = new Map<string, typeof courseRows>();
  for (const r of courseRows) byCourse.set(r.id, [...(byCourse.get(r.id) ?? []), r]);
  let course: AboutCourse | null = null;
  let courseCount = 0;
  let replayCount = 0;
  for (const rows of byCourse.values()) {
    const total = rows.reduce((n, r) => n + r.lessons, 0);
    if (rows[0].slug === REPLAYS_COURSE_SLUG) {
      replayCount = total;
      continue;
    }
    if (total === 0) continue;
    courseCount += 1;
    if (!course) {
      course = {
        slug: rows[0].slug,
        title: rows[0].title,
        description: rows[0].description ?? "",
        coverUrl: realCoverUrl(rows[0].image_url),
        lessonCount: total,
        chapters: rows.filter((r) => r.chapter_title).map((r) => ({ title: r.chapter_title!, lessons: r.lessons })),
        previewLessonId: rows.map((r) => r.preview_id).find(Boolean) ?? null,
        replayCount: 0,
      };
    }
  }
  if (course) course.replayCount = replayCount;

  const teacherIds = Array.from(new Set(lessonRows.map((l) => l.teacher_id || community.created_by)));
  const slots = offered.privateLessons ? await getOpenSlots(community.id, teacherIds, now) : [];
  const lessons: AboutLesson[] = lessonRows.map((l) => ({
    id: l.id,
    title: l.title,
    durationMinutes: l.duration_minutes,
    regularPrice: l.regular_price,
    memberPrice: l.member_price != null && l.member_price > 0 && l.member_price < l.regular_price ? l.member_price : null,
    nextFree: slots.find((s) => s.teacherId === (l.teacher_id || community.created_by))?.startsAt ?? null,
    cutoffHours: l.cancellation_cutoff_hours,
    latePolicy: l.late_refund_policy,
  }));

  const categories = (Array.isArray(community.thread_categories) ? community.thread_categories : []) as Array<{ id: string; name: string; color?: string }>;
  const topicCounts = categories.length
    ? await query<{ category_id: string; n: number }>`
        SELECT category_id, COUNT(*)::int AS n FROM threads
        WHERE community_id = ${community.id} AND category_id IS NOT NULL
        GROUP BY category_id
      `
    : [];
  const topics = categories
    .map((c) => ({ name: c.name, color: c.color || "#8E57DB", count: topicCounts.find((t) => t.category_id === c.id)?.n ?? 0 }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    memberCount,
    upcoming,
    course,
    courseCount,
    lessons,
    activity: { posts30: activity?.posts30 ?? 0, replies30: activity?.replies30 ?? 0, topics },
  };
});
