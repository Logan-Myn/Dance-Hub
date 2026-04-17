import { cache } from 'react';
import { query, queryOne } from './db';

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
