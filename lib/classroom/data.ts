import { cache } from "react";
import { query } from "@/lib/db";
import {
  courseStatus,
  nextLesson,
  notesForSearch,
  realCoverUrl,
  type CourseStatus,
  type LessonSearchItem,
} from "./model";
import { REPLAYS_COURSE_SLUG, replayTitle } from "./replays";

export interface ClassroomCourse {
  id: string;
  slug: string;
  title: string;
  description: string;
  coverUrl: string | null;
  isPublic: boolean;
  createdAt: string;
  chapterCount: number;
  lessonCount: number;
  completedCount: number;
  status: CourseStatus;
  next: { id: string; title: string; chapterTitle: string; number: number } | null;
  /** Managers only: members who did at least one lesson / every lesson. */
  started?: number;
  finished?: number;
}

export interface ReplayItem {
  lessonId: string;
  title: string;
  date: string;
  durationMinutes: number | null;
  playbackId: string | null;
  watched: boolean;
}

export interface ClassroomOverview {
  courses: ClassroomCourse[];
  replays: { courseSlug: string; isPublic: boolean; items: ReplayItem[] } | null;
  lessons: LessonSearchItem[];
}

const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());

/**
 * Everything the classroom list needs in three queries: courses, their
 * lessons in order with the viewer's completions and any recording data,
 * and (for managers) how many members started or finished each course.
 */
export const getClassroomOverview = cache(async (
  communityId: string,
  userId: string,
  canManage: boolean,
): Promise<ClassroomOverview> => {
  const courseRows = await query<{
    id: string; slug: string; title: string; description: string | null; image_url: string | null;
    is_public: boolean | null; created_at: Date | string;
  }>`
    SELECT id, slug, title, description, image_url, is_public, created_at
    FROM courses
    WHERE community_id = ${communityId}
      AND (${canManage} OR is_public = true)
    ORDER BY created_at DESC
  `;
  if (courseRows.length === 0) return { courses: [], replays: null, lessons: [] };
  const courseIds = courseRows.map((c) => c.id);

  const lessonRows = await query<{
    course_id: string; chapter_id: string; chapter_title: string; id: string; title: string;
    content: string | null; playback_id: string | null; created_at: Date | string; done: boolean;
    duration_seconds: number | null; class_start: Date | string | null;
  }>`
    SELECT ch.course_id, ch.id AS chapter_id, ch.title AS chapter_title,
           l.id, l.title, l.content, l.playback_id, l.created_at,
           (lc.id IS NOT NULL) AS done,
           r.duration_seconds, lcl.scheduled_start_time AS class_start
    FROM chapters ch
    JOIN lessons l ON l.chapter_id = ch.id
    LEFT JOIN lesson_completions lc ON lc.lesson_id = l.id AND lc.user_id = ${userId}
    LEFT JOIN LATERAL (
      SELECT duration_seconds, live_class_id FROM live_class_recordings
      WHERE lesson_id = l.id ORDER BY created_at DESC LIMIT 1
    ) r ON true
    LEFT JOIN live_classes lcl ON lcl.id = r.live_class_id
    WHERE ch.course_id = ANY(${courseIds}::uuid[])
    ORDER BY ch.course_id, ch.chapter_position, l.lesson_position
  `;

  const byCourse = new Map<string, typeof lessonRows>();
  for (const l of lessonRows) byCourse.set(l.course_id, [...(byCourse.get(l.course_id) ?? []), l]);

  let stats = new Map<string, { started: number; finished: number }>();
  if (canManage) {
    const rows = await query<{ course_id: string; user_id: string; done: number }>`
      SELECT ch.course_id, c.user_id, COUNT(*)::int AS done
      FROM lesson_completions c
      JOIN lessons l ON l.id = c.lesson_id
      JOIN chapters ch ON ch.id = l.chapter_id
      JOIN community_members m ON m.user_id = c.user_id AND m.community_id = ${communityId}
      WHERE ch.course_id = ANY(${courseIds}::uuid[])
        AND m.status = 'active' AND m.role != 'admin'
      GROUP BY ch.course_id, c.user_id
    `;
    stats = new Map();
    for (const r of rows) {
      const total = byCourse.get(r.course_id)?.length ?? 0;
      const s = stats.get(r.course_id) ?? { started: 0, finished: 0 };
      s.started += 1;
      if (total > 0 && r.done >= total) s.finished += 1;
      stats.set(r.course_id, s);
    }
  }

  const courses: ClassroomCourse[] = [];
  const lessons: LessonSearchItem[] = [];
  let replays: ClassroomOverview["replays"] = null;

  for (const c of courseRows) {
    const rows = byCourse.get(c.id) ?? [];
    const ordered = rows.map((l) => ({
      id: l.id, title: l.title, chapterId: l.chapter_id, chapterTitle: l.chapter_title, completed: l.done,
    }));
    const isReplays = c.slug === REPLAYS_COURSE_SLUG;
    rows.forEach((l, i) =>
      lessons.push({
        id: l.id,
        title: isReplays ? replayTitle(l.title) : l.title,
        courseSlug: c.slug,
        courseTitle: c.title,
        chapterTitle: l.chapter_title,
        number: i + 1,
        notes: notesForSearch(l.content),
        completed: l.done,
      })
    );

    if (isReplays) {
      replays = {
        courseSlug: c.slug,
        isPublic: c.is_public ?? true,
        items: rows
          .map((l) => ({
            lessonId: l.id,
            title: replayTitle(l.title),
            date: iso(l.class_start ?? l.created_at),
            durationMinutes: l.duration_seconds ? Math.max(1, Math.round(l.duration_seconds / 60)) : null,
            playbackId: l.playback_id,
            watched: l.done,
          }))
          .sort((a, b) => b.date.localeCompare(a.date)),
      };
      continue;
    }

    const completed = ordered.filter((l) => l.completed).length;
    const next = nextLesson(ordered);
    courses.push({
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description ?? "",
      coverUrl: realCoverUrl(c.image_url),
      isPublic: c.is_public ?? true,
      createdAt: iso(c.created_at),
      chapterCount: new Set(rows.map((r) => r.chapter_id)).size,
      lessonCount: rows.length,
      completedCount: completed,
      status: courseStatus(completed, rows.length),
      next: next ? { id: next.id, title: next.title, chapterTitle: next.chapterTitle, number: next.number } : null,
      ...(canManage ? stats.get(c.id) ?? { started: 0, finished: 0 } : {}),
    });
  }

  return { courses, replays, lessons };
});
