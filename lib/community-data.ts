import { cache } from 'react';
import { query, queryOne } from './db';
import { sanitizeRichText, sanitizeRichTextOrNull } from './sanitize-html';
import type { PrivateLesson } from '@/types/private-lessons';

export interface CommunityRow {
  id: string;
  created_by: string;
  name: string;
  description: string | null;
  image_url: string | null;
  image_focal_x?: number | null;
  image_focal_y?: number | null;
  image_zoom?: number | string | null;
  slug: string;
  membership_enabled?: boolean | null;
  membership_price?: number | string | null;
  yearly_enabled?: boolean | null;
  yearly_price?: number | string | null;
  yearly_benefits?: string | null;
  stripe_account_id?: string | null;
  thread_categories?: unknown;
  custom_links?: unknown;
  status?: string | null;
  opening_date?: string | Date | null;
  about_page?: {
    sections?: unknown[];
    meta?: { last_updated?: string; published_version?: string };
  } | null;
  offers_live_classes?: boolean | null;
  offers_courses?: boolean | null;
  offers_private_lessons?: boolean | null;
  is_broadcast_vip?: boolean | null;
}

// cache() dedupes calls within a single server render pass. Layout and
// pages can both call this and only one DB round-trip happens.
export const getCommunityBySlug = cache(async (slug: string) => {
  return queryOne<CommunityRow>`
    SELECT *
    FROM communities WHERE slug = ${slug}
  `;
});

// Same people as the roster served by GET /api/community/[slug]/members, so
// the feed header can start from the right number before that request lands.
// The stored counters on communities drift from this and aren't used.
export const getRosterCount = cache(async (communityId: string): Promise<number> => {
  const row = await queryOne<{ count: number }>`
    SELECT COUNT(*)::int AS count
    FROM community_members_with_profiles
    WHERE community_id = ${communityId}
      AND status = 'active'
      AND role != 'admin'
      AND (subscription_status = 'active' OR subscription_status IS NULL)
  `;
  return row?.count ?? 0;
});

// Mirrors the logic in /api/community/[slug]/check-subscription: active OR
// in grace period after cancel. Returns false when user has no row.
// Thin wrapper over getMembershipStatus so the layout + page that hit this
// pair share a single cached SQL query per request instead of two.
export const getCommunityMembership = async (
  communityId: string,
  userId: string
): Promise<boolean> => {
  const status = await getMembershipStatus(communityId, userId);
  return status.isMember;
};

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
  status: LiveClassStatus;
  created_at: string;
  updated_at: string;
  teacher_name: string;
  teacher_avatar_url: string | null;
  is_currently_active: boolean;
  is_starting_soon: boolean;
}

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
  cancellation_cutoff_hours: number;
  late_refund_policy: 'refund' | 'no_refund';
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
    cancellation_cutoff_hours: r.cancellation_cutoff_hours,
    late_refund_policy: r.late_refund_policy,
    created_at: toIso(r.created_at),
    updated_at: toIso(r.updated_at),
  }));
});

// Pre-fetched community threads for the feed page so the thread list
// renders in the same paint as the chrome. Mirrors the shape returned by
// /api/community/[slug]/threads so SWR can hydrate from this directly.
export interface CommunityThread {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  userId: string;
  category: string;
  categoryId: string | null;
  likesCount: number;
  commentsCount: number;
  likes: string[];
  comments: Array<{
    id: string;
    thread_id: string;
    user_id: string;
    content: string;
    created_at: string;
    parent_id: string | null;
    author: { name: string; image: string };
    likes: string[];
    likes_count: number;
  }>;
  pinned: boolean;
  author: { name: string; image: string };
  /** Feed only: newest reply time and the last 3 people who replied, newest first. */
  lastReplyAt?: string | null;
  repliers?: Array<{ id: string; name: string; image: string }>;
}

interface ThreadQueryRow {
  id: string;
  title: string;
  content: string;
  created_at: Date | string;
  user_id: string;
  category_name: string | null;
  category_id: string | null;
  pinned: boolean | null;
  profile_id: string | null;
  profile_full_name: string | null;
  profile_avatar_url: string | null;
  profile_display_name: string | null;
  likes: string[] | null;
  likes_count: number;
  comments_count: number;
  last_reply_at?: Date | string | null;
  repliers?: Array<{ id: string; name: string | null; image: string | null }> | null;
}

interface CommentQueryRow {
  id: string;
  thread_id: string;
  user_id: string;
  content: string;
  created_at: Date | string;
  parent_id: string | null;
  author: { name: string; image: string } | null;
  likes: string[] | null;
  likes_count: number;
}

export const getCommunityThreads = cache(async (communityId: string): Promise<CommunityThread[]> => {
  const threads = await query<ThreadQueryRow>`
    SELECT
      t.id,
      t.title,
      t.content,
      t.created_at,
      t.user_id,
      t.category_name,
      t.category_id,
      t.pinned,
      p.id as profile_id,
      p.full_name as profile_full_name,
      p.avatar_url as profile_avatar_url,
      p.display_name as profile_display_name,
      COALESCE(t.likes, ARRAY[]::TEXT[]) as likes,
      COALESCE(array_length(t.likes, 1), 0)::int as likes_count,
      (SELECT COUNT(*) FROM comments c WHERE c.thread_id = t.id)::int as comments_count,
      (SELECT MAX(c.created_at) FROM comments c WHERE c.thread_id = t.id) as last_reply_at,
      (
        SELECT COALESCE(json_agg(json_build_object('id', r.user_id, 'name', r.name, 'image', r.image) ORDER BY r.last_at DESC), '[]'::json)
        FROM (
          SELECT c.user_id,
                 MAX(c.created_at) AS last_at,
                 COALESCE(MAX(NULLIF(rp.display_name, '')), MAX(NULLIF(rp.full_name, '')), (array_agg(c.author->>'name' ORDER BY c.created_at DESC))[1]) AS name,
                 COALESCE(MAX(NULLIF(rp.avatar_url, '')), (array_agg(NULLIF(c.author->>'image', '') ORDER BY c.created_at DESC))[1]) AS image
          FROM comments c
          LEFT JOIN profiles rp ON rp.auth_user_id = c.user_id
          WHERE c.thread_id = t.id
          GROUP BY c.user_id
          ORDER BY last_at DESC
          LIMIT 3
        ) r
      ) as repliers
    FROM threads t
    LEFT JOIN profiles p ON p.auth_user_id = t.user_id
    WHERE t.community_id = ${communityId}
    ORDER BY t.created_at DESC
  `;

  const toIso = (v: Date | string): string =>
    v instanceof Date ? v.toISOString() : v;

  // Comment bodies are loaded on demand by ThreadView when a thread opens —
  // the feed only needs `commentsCount`. Bodies are sanitized on the way out
  // as well as on write, for rows stored before write-time sanitizing.
  return threads.map((t) => ({
    id: t.id,
    title: t.title,
    content: sanitizeRichText(t.content),
    createdAt: toIso(t.created_at),
    userId: t.user_id,
    author: {
      name: t.profile_display_name || t.profile_full_name || 'Anonymous',
      image: t.profile_avatar_url || '',
    },
    category: t.category_name || 'General',
    categoryId: t.category_id,
    likesCount: t.likes_count || 0,
    commentsCount: t.comments_count || 0,
    likes: t.likes || [],
    comments: [],
    pinned: t.pinned ?? false,
    lastReplyAt: t.last_reply_at ? toIso(t.last_reply_at) : null,
    repliers: (t.repliers ?? []).map((r) => ({ id: r.id, name: r.name || 'Member', image: r.image || '' })),
  }));
});

export const getThreadById = cache(
  async (communityId: string, threadId: string): Promise<CommunityThread | null> => {
    const row = await queryOne<ThreadQueryRow>`
      SELECT
        t.id,
        t.title,
        t.content,
        t.created_at,
        t.user_id,
        t.category_name,
        t.category_id,
        t.pinned,
        p.id as profile_id,
        p.full_name as profile_full_name,
        p.avatar_url as profile_avatar_url,
        p.display_name as profile_display_name,
        COALESCE(t.likes, ARRAY[]::TEXT[]) as likes,
        COALESCE(array_length(t.likes, 1), 0)::int as likes_count,
        (SELECT COUNT(*) FROM comments c WHERE c.thread_id = t.id)::int as comments_count
      FROM threads t
      LEFT JOIN profiles p ON p.auth_user_id = t.user_id
      WHERE t.id = ${threadId}
        AND t.community_id = ${communityId}
    `;

    if (!row) return null;

    const comments = await query<CommentQueryRow>`
      SELECT
        c.id, c.thread_id, c.user_id, c.content, c.created_at,
        c.parent_id, c.author,
        COALESCE(c.likes, ARRAY[]::TEXT[]) as likes,
        COALESCE(c.likes_count, 0) as likes_count
      FROM comments c
      WHERE c.thread_id = ${threadId}
      ORDER BY c.created_at ASC
    `;

    const toIso = (v: Date | string): string =>
      v instanceof Date ? v.toISOString() : v;

    return {
      id: row.id,
      title: row.title,
      content: sanitizeRichText(row.content),
      createdAt: toIso(row.created_at),
      userId: row.user_id,
      author: {
        name: row.profile_display_name || row.profile_full_name || 'Anonymous',
        image: row.profile_avatar_url || '',
      },
      category: row.category_name || 'General',
      categoryId: row.category_id,
      likesCount: row.likes_count,
      commentsCount: row.comments_count,
      likes: row.likes ?? [],
      comments: comments.map((c) => ({
        id: c.id,
        thread_id: c.thread_id,
        user_id: c.user_id,
        content: c.content,
        created_at: toIso(c.created_at),
        parent_id: c.parent_id,
        author: c.author ?? { name: 'Anonymous', image: '' },
        likes: c.likes ?? [],
        likes_count: c.likes_count,
      })),
      pinned: !!row.pinned,
    };
  },
);

// Full membership status for the feed page, which needs to distinguish
// active members from pre-registered ones and surface subscription state.
// Returns null fields when the user has no row in community_members.
export interface MembershipStatus {
  isMember: boolean;
  isPreRegistered: boolean;
  status: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
}

export interface MembershipRow {
  status: string;
  subscription_status: string | null;
  current_period_end: Date | string | null;
}

export const getMembershipStatus = cache(async (
  communityId: string,
  userId: string,
): Promise<MembershipStatus> => {
  const member = await queryOne<MembershipRow>`
    SELECT status, subscription_status, current_period_end
    FROM community_members
    WHERE community_id = ${communityId}
      AND user_id = ${userId}
  `;
  return toMembershipStatus(member);
});

// Also used by the leave / reactivate routes, so the feed can take its
// membership state from their responses instead of guessing it.
export function toMembershipStatus(member: MembershipRow | null | undefined): MembershipStatus {
  if (!member) {
    return { isMember: false, isPreRegistered: false, status: null, subscriptionStatus: null, currentPeriodEnd: null };
  }
  const periodEnd = member.current_period_end
    ? (member.current_period_end instanceof Date
        ? member.current_period_end
        : new Date(member.current_period_end))
    : null;
  const isPreRegistered =
    member.status === 'pre_registered' || member.status === 'pending_pre_registration';
  // Only an active membership counts. A member who cancels keeps status
  // 'active' (subscription_status 'canceling') until the paid period ends and
  // the subscription.deleted webhook marks them inactive, so the grace period
  // is covered. subscription_status alone never grants access: a
  // pre-registered or pending row marked 'canceling' never paid for a period.
  const isMember = member.status === 'active';
  return {
    isMember,
    isPreRegistered,
    status: member.status,
    subscriptionStatus: member.subscription_status,
    currentPeriodEnd: periodEnd ? periodEnd.toISOString() : null,
  };
}

// Site-wide admin flag from profiles.is_admin (mapped from better-auth user
// id via auth_user_id). Used by classroom to give admins blanket access.
export const getUserIsAdmin = cache(async (authUserId: string): Promise<boolean> => {
  const row = await queryOne<{ is_admin: boolean }>`
    SELECT is_admin FROM profiles WHERE auth_user_id = ${authUserId}
  `;
  return !!row?.is_admin;
});

// Profile shape used by the top-app Navbar. Cached so the same render can
// resolve session + profile without two DB hits.
export interface NavbarProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export const getProfileForUser = cache(async (authUserId: string): Promise<NavbarProfile | null> => {
  return queryOne<NavbarProfile>`
    SELECT id, full_name, avatar_url
    FROM profiles WHERE auth_user_id = ${authUserId}
  `;
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
  const lessonIds = lessons.map((l) => l.id);
  if (userId && lessonIds.length > 0) {
    const completions = await query<{ lesson_id: string }>`
      SELECT lesson_id FROM lesson_completions
      WHERE user_id = ${userId}
        AND lesson_id = ANY(${lessonIds}::uuid[])
    `;
    completedLessonIds = new Set(completions.map((c) => c.lesson_id));
  }

  const lessonsByChapter = new Map<string, CourseChapterWithLessons['lessons']>();
  for (const l of lessons) {
    const arr = lessonsByChapter.get(l.chapter_id) ?? [];
    arr.push({
      ...l,
      // Rendered as HTML on the classroom page; older rows predate sanitizing.
      content: sanitizeRichTextOrNull(l.content),
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

// ---------------------------------------------------------------------------
// Feed page loaders (community redesign, phase 2)
// ---------------------------------------------------------------------------

export interface FeedVisit {
  feedVisitAt: string | null;
  feedPrevVisitAt: string | null;
}

/** The viewer's last two feed visits (see lib/feed/visits.ts). */
// Never fails the page: without the columns (migration not applied yet) or on
// a query error the feed just shows no "New" dots.
export const getFeedVisit = cache(async (communityId: string, userId: string): Promise<FeedVisit> => {
  const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);
  try {
    const row = await queryOne<{ feed_visit_at: Date | string | null; feed_prev_visit_at: Date | string | null }>`
      SELECT feed_visit_at, feed_prev_visit_at
      FROM community_members
      WHERE community_id = ${communityId} AND user_id = ${userId}
    `;
    return { feedVisitAt: iso(row?.feed_visit_at), feedPrevVisitAt: iso(row?.feed_prev_visit_at) };
  } catch (error) {
    console.error('getFeedVisit failed:', error);
    return { feedVisitAt: null, feedPrevVisitAt: null };
  }
});

export interface PublicProfile {
  id: string;
  name: string;
  avatarUrl: string | null;
  timezone: string | null;
}

/** Name, photo and saved time zone for a better-auth user id. */
export const getPublicProfile = cache(async (authUserId: string): Promise<PublicProfile | null> => {
  const row = await queryOne<{ display_name: string | null; full_name: string | null; avatar_url: string | null; timezone: string | null }>`
    SELECT display_name, full_name, avatar_url, timezone
    FROM profiles WHERE auth_user_id = ${authUserId}
  `;
  if (!row) return null;
  return {
    id: authUserId,
    name: row.display_name || row.full_name || 'Member',
    avatarUrl: row.avatar_url || null,
    timezone: row.timezone || null,
  };
});

export interface UpcomingClass {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  durationMinutes: number;
  status: LiveClassStatus;
  teacherName: string;
  teacherTimezone: string | null;
}

/** The next classes that haven't ended yet (a live one first), soonest first. */
export const getUpcomingClasses = cache(async (communityId: string, limit = 2): Promise<UpcomingClass[]> => {
  const rows = await query<{
    id: string; title: string; description: string | null; scheduled_start_time: Date | string;
    duration_minutes: number; status: LiveClassStatus; teacher_name: string; teacher_timezone: string | null;
  }>`
    SELECT lc.id, lc.title, lc.description, lc.scheduled_start_time, lc.duration_minutes, lc.status,
           lc.teacher_name, p.timezone AS teacher_timezone
    FROM live_classes_with_details lc
    LEFT JOIN profiles p ON p.auth_user_id = lc.teacher_id
    WHERE lc.community_id = ${communityId}
      AND lc.status IN ('scheduled', 'live')
      -- A live class that runs over its slot stays until it is ended.
      AND (lc.status = 'live' OR lc.scheduled_start_time + make_interval(mins => lc.duration_minutes) > NOW())
      AND lc.scheduled_start_time <= NOW() + INTERVAL '60 days'
    ORDER BY (lc.status = 'live') DESC, lc.scheduled_start_time ASC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    startsAt: new Date(r.scheduled_start_time).toISOString(),
    durationMinutes: r.duration_minutes,
    status: r.status,
    teacherName: r.teacher_name,
    teacherTimezone: r.teacher_timezone || null,
  }));
});

export interface CourseProgress {
  courseTitle: string;
  courseSlug: string;
  completed: number;
  total: number;
  /** First lesson not completed yet, in course order, and its 1-based number. */
  nextLessonTitle: string | null;
  nextLessonNumber: number | null;
  started: boolean;
}

/**
 * The course the viewer last completed a lesson in (not finished yet), or
 * else the newest course with lessons. Private courses only for managers.
 */
export const getCourseProgress = cache(async (
  communityId: string,
  userId: string,
  includePrivate: boolean,
): Promise<CourseProgress | null> => {
  const rows = await query<{
    course_id: string; title: string; slug: string; created_at: Date | string;
    lesson_title: string; done_at: Date | string | null;
  }>`
    SELECT co.id AS course_id, co.title, co.slug, co.created_at,
           l.title AS lesson_title, lc.completed_at AS done_at
    FROM courses co
    JOIN chapters ch ON ch.course_id = co.id
    JOIN lessons l ON l.chapter_id = ch.id
    LEFT JOIN lesson_completions lc ON lc.lesson_id = l.id AND lc.user_id = ${userId}
    WHERE co.community_id = ${communityId}
      AND (${includePrivate} OR co.is_public = true)
      AND co.slug <> 'live-class-replays'
    ORDER BY co.id, ch.chapter_position, l.lesson_position
  `;
  if (rows.length === 0) return null;

  const byCourse = new Map<string, typeof rows>();
  for (const r of rows) byCourse.set(r.course_id, [...(byCourse.get(r.course_id) ?? []), r]);

  const summaries = Array.from(byCourse.values()).map((lessons) => {
    const lastDone = lessons.reduce<number>((max, l) => (l.done_at ? Math.max(max, new Date(l.done_at).getTime()) : max), 0);
    const completed = lessons.filter((l) => l.done_at).length;
    const nextIndex = lessons.findIndex((l) => !l.done_at);
    return {
      courseTitle: lessons[0].title,
      courseSlug: lessons[0].slug,
      createdAt: new Date(lessons[0].created_at).getTime(),
      completed,
      total: lessons.length,
      nextLessonTitle: nextIndex >= 0 ? lessons[nextIndex].lesson_title : null,
      nextLessonNumber: nextIndex >= 0 ? nextIndex + 1 : null,
      lastDone,
    };
  });

  const inProgress = summaries
    .filter((c) => c.completed > 0 && c.completed < c.total)
    .sort((a, b) => b.lastDone - a.lastDone)[0];
  const pick = inProgress ?? summaries.filter((c) => c.completed === 0).sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!pick) return null;
  return {
    courseTitle: pick.courseTitle,
    courseSlug: pick.courseSlug,
    completed: pick.completed,
    total: pick.total,
    nextLessonTitle: pick.nextLessonTitle,
    nextLessonNumber: pick.nextLessonNumber,
    started: pick.completed > 0,
  };
});
