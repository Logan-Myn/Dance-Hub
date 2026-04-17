import { cache } from 'react';
import { query, queryOne } from './db';
import type { PrivateLesson } from '@/types/private-lessons';

export interface CommunityRow {
  id: string;
  created_by: string;
  name: string;
  description: string | null;
  image_url: string | null;
  slug: string;
}

// cache() dedupes calls within a single server render pass. Layout and
// pages can both call this and only one DB round-trip happens.
export const getCommunityBySlug = cache(async (slug: string) => {
  return queryOne<CommunityRow>`
    SELECT id, created_by, name, description, image_url, slug
    FROM communities WHERE slug = ${slug}
  `;
});

// Mirrors the logic in /api/community/[slug]/check-subscription: active OR
// in grace period after cancel. Returns false when user has no row.
export const getCommunityMembership = cache(async (communityId: string, userId: string) => {
  const member = await queryOne<{
    status: string;
    subscription_status: string | null;
    current_period_end: string | null;
  }>`
    SELECT status, subscription_status, current_period_end
    FROM community_members
    WHERE community_id = ${communityId}
      AND user_id = ${userId}
  `;
  if (!member) return false;
  const periodEnd = member.current_period_end ? new Date(member.current_period_end) : null;
  const inGracePeriod =
    member.subscription_status === 'canceling' && periodEnd && periodEnd > new Date();
  return member.status === 'active' || !!inGracePeriod;
});

// Shape matches the /api/community/[slug]/live-classes GET response.
export type LiveClassStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';

export interface LiveClassWithDetails {
  id: string;
  community_id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  scheduled_start_time: string;
  duration_minutes: number;
  daily_room_name: string | null;
  daily_room_url: string | null;
  status: LiveClassStatus;
  created_at: string;
  updated_at: string;
  teacher_name: string;
  teacher_avatar_url: string | null;
  is_currently_active: boolean;
  is_starting_soon: boolean;
}

// Pre-fetch live classes for a given week so the calendar page can render
// with initial data (no client-side spinner on first paint).
//
// The neon driver returns timestamptz columns as JS Date objects, which
// survive RSC serialization as Dates — but the /api/.../live-classes route
// returns them as ISO strings (via JSON.stringify). Callers downstream
// (date-fns parseISO, WeekCalendar) assume strings, so we normalize here.
export const getLiveClassesForWeek = cache(async (
  communityId: string,
  weekStartISO: string, // 'yyyy-MM-dd'
  weekEndISO: string,   // 'yyyy-MM-dd'
) => {
  const rows = await query<LiveClassWithDetails>`
    SELECT *
    FROM live_classes_with_details
    WHERE community_id = ${communityId}
      AND scheduled_start_time >= ${`${weekStartISO}T00:00:00`}
      AND scheduled_start_time <= ${`${weekEndISO}T23:59:59`}
    ORDER BY scheduled_start_time ASC
  `;
  const toIso = (v: unknown): string =>
    v instanceof Date ? v.toISOString() : (v as string);
  return rows.map((r) => ({
    ...r,
    scheduled_start_time: toIso(r.scheduled_start_time),
    created_at: toIso(r.created_at),
    updated_at: toIso(r.updated_at),
  }));
});

// Row shape straight out of the DB (matches the private_lessons table) —
// differs from the client-side PrivateLesson type in that nullable fields
// arrive as `null` and timestamps as Date objects.
interface PrivateLessonRow {
  id: string;
  community_id: string;
  teacher_id: string | null;
  title: string;
  description: string | null;
  duration_minutes: number;
  regular_price: number | string;
  member_price: number | string | null;
  member_discount_percentage: number | string;
  is_active: boolean;
  max_bookings_per_month: number | null;
  requirements: string | null;
  location_type: 'online' | 'in_person' | 'both';
  created_at: Date | string;
  updated_at: Date | string;
}

// Pre-fetch private lessons for a community so the page can render with
// initial data (no client-side spinner on first paint). Pass
// includeInactive=true when the viewer is the community owner so they can
// see and manage hidden lessons inline (matches the classroom Private
// badge pattern).
export const getActivePrivateLessons = cache(async (
  communityId: string,
  includeInactive: boolean = false,
): Promise<PrivateLesson[]> => {
  const rows = includeInactive
    ? await query<PrivateLessonRow>`
        SELECT *
        FROM private_lessons
        WHERE community_id = ${communityId}
        ORDER BY is_active DESC, created_at DESC
      `
    : await query<PrivateLessonRow>`
        SELECT *
        FROM private_lessons
        WHERE community_id = ${communityId}
          AND is_active = true
        ORDER BY created_at DESC
      `;
  const toIso = (v: Date | string): string =>
    v instanceof Date ? v.toISOString() : v;
  const toNum = (v: number | string | null | undefined): number | undefined =>
    v == null ? undefined : typeof v === 'number' ? v : parseFloat(v);
  return rows.map((r) => ({
    id: r.id,
    community_id: r.community_id,
    teacher_id: r.teacher_id ?? '',
    title: r.title,
    description: r.description ?? undefined,
    duration_minutes: r.duration_minutes,
    regular_price: toNum(r.regular_price)!,
    member_price: toNum(r.member_price),
    member_discount_percentage: toNum(r.member_discount_percentage)!,
    is_active: r.is_active,
    max_bookings_per_month: r.max_bookings_per_month ?? undefined,
    requirements: r.requirements ?? undefined,
    location_type: r.location_type,
    created_at: toIso(r.created_at),
    updated_at: toIso(r.updated_at),
  }));
});

// Site-wide admin flag from profiles.is_admin (mapped from better-auth user
// id via auth_user_id). Used by classroom to give admins blanket access.
export const getUserIsAdmin = cache(async (authUserId: string): Promise<boolean> => {
  const row = await queryOne<{ is_admin: boolean }>`
    SELECT is_admin FROM profiles WHERE auth_user_id = ${authUserId}
  `;
  return !!row?.is_admin;
});

export interface CourseRow {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  slug: string;
  community_id: string | null;
  created_by: string | null;
  is_public: boolean | null;
  created_at: Date | string;
  updated_at: Date | string;
}

// Matches types/course.ts (which CourseCard etc. expect): non-nullable
// description / image_url. We coerce DB nulls to empty strings during
// normalization below.
export interface Course {
  id: string;
  title: string;
  description: string;
  image_url: string;
  slug: string;
  community_id: string;
  created_by: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

// Pre-fetch courses for a community. includePrivate=true returns is_public=false
// rows too — only the creator and site admins should pass true.
export const getCoursesForCommunity = cache(async (
  communityId: string,
  includePrivate: boolean = false,
): Promise<Course[]> => {
  const rows = includePrivate
    ? await query<CourseRow>`
        SELECT *
        FROM courses
        WHERE community_id = ${communityId}
        ORDER BY created_at DESC
      `
    : await query<CourseRow>`
        SELECT *
        FROM courses
        WHERE community_id = ${communityId}
          AND is_public = true
        ORDER BY created_at DESC
      `;
  const toIsoStr = (v: Date | string): string =>
    v instanceof Date ? v.toISOString() : v;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    image_url: r.image_url ?? '',
    slug: r.slug,
    community_id: r.community_id ?? communityId,
    created_by: r.created_by,
    is_public: r.is_public ?? true,
    created_at: toIsoStr(r.created_at),
    updated_at: toIsoStr(r.updated_at),
  }));
});

// Pre-fetch a course with its chapters and lessons (and per-user completion
// state). Mirrors the shape returned by /api/community/[slug]/courses/[slug]
// so the client component's SWR can hydrate from it.
interface ChapterRow {
  id: string;
  title: string;
  chapter_position: number;
  course_id: string;
}

interface LessonRow {
  id: string;
  title: string;
  content: string | null;
  video_asset_id: string | null;
  chapter_id: string;
  lesson_position: number;
  playback_id: string | null;
}

export interface CourseChapterWithLessons extends ChapterRow {
  lessons: Array<LessonRow & {
    videoAssetId: string | null;
    playbackId: string | null;
    completed: boolean;
  }>;
}

export interface CourseWithChapters extends Course {
  chapters: CourseChapterWithLessons[];
}

export const getCourseWithChapters = cache(async (
  communityId: string,
  courseSlug: string,
  userId: string | null,
): Promise<CourseWithChapters | null> => {
  const courseRow = await queryOne<CourseRow>`
    SELECT *
    FROM courses
    WHERE community_id = ${communityId}
      AND slug = ${courseSlug}
  `;
  if (!courseRow) return null;

  const chapters = await query<ChapterRow>`
    SELECT *
    FROM chapters
    WHERE course_id = ${courseRow.id}
    ORDER BY chapter_position ASC
  `;

  const chapterIds = chapters.map((c) => c.id);
  const lessons = chapterIds.length > 0
    ? await query<LessonRow>`
        SELECT *
        FROM lessons
        WHERE chapter_id = ANY(${chapterIds})
        ORDER BY lesson_position ASC
      `
    : [];

  let completedLessonIds = new Set<string>();
  if (userId) {
    const completions = await query<{ lesson_id: string }>`
      SELECT lesson_id FROM lesson_completions WHERE user_id = ${userId}
    `;
    completedLessonIds = new Set(completions.map((c) => c.lesson_id));
  }

  const lessonsByChapter = new Map<string, CourseChapterWithLessons['lessons']>();
  for (const l of lessons) {
    const arr = lessonsByChapter.get(l.chapter_id) ?? [];
    arr.push({
      ...l,
      videoAssetId: l.video_asset_id,
      playbackId: l.playback_id,
      completed: completedLessonIds.has(l.id),
    });
    lessonsByChapter.set(l.chapter_id, arr);
  }

  const toIsoStr = (v: Date | string): string =>
    v instanceof Date ? v.toISOString() : v;

  return {
    id: courseRow.id,
    title: courseRow.title,
    description: courseRow.description ?? '',
    image_url: courseRow.image_url ?? '',
    slug: courseRow.slug,
    community_id: courseRow.community_id ?? communityId,
    created_by: courseRow.created_by,
    is_public: courseRow.is_public ?? true,
    created_at: toIsoStr(courseRow.created_at),
    updated_at: toIsoStr(courseRow.updated_at),
    chapters: chapters.map((c) => ({
      ...c,
      lessons: lessonsByChapter.get(c.id) ?? [],
    })),
  };
});
