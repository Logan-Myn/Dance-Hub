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

// Pre-fetch active private lessons for a community so the page can render
// with initial data (no client-side spinner on first paint).
export const getActivePrivateLessons = cache(async (communityId: string): Promise<PrivateLesson[]> => {
  const rows = await query<PrivateLessonRow>`
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
