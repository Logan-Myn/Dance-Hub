import { queryOne, query } from '@/lib/db';
import {
  getCalendarMonthRange,
  computeMoMGrowth,
} from '@/lib/admin-dashboard/stats';
import type { PlatformGrowthPoint } from './types';

type CountRow = { count: number };

/**
 * Total profiles count + new this month + MoM growth.
 */
export async function getUserStats(now: Date = new Date()) {
  const thisMonth = getCalendarMonthRange(now, 0);
  const lastMonth = getCalendarMonthRange(now, -1);

  const [total, thisCount, lastCount] = await Promise.all([
    queryOne<CountRow>`SELECT COUNT(*)::int AS count FROM profiles`,
    queryOne<CountRow>`
      SELECT COUNT(*)::int AS count
      FROM profiles
      WHERE created_at >= ${thisMonth.start.toISOString()}
        AND created_at < ${thisMonth.end.toISOString()}
    `,
    queryOne<CountRow>`
      SELECT COUNT(*)::int AS count
      FROM profiles
      WHERE created_at >= ${lastMonth.start.toISOString()}
        AND created_at < ${lastMonth.end.toISOString()}
    `,
  ]);

  const newThisMonth = thisCount?.count ?? 0;
  const newLastMonth = lastCount?.count ?? 0;
  return {
    total: total?.count ?? 0,
    newThisMonth,
    growth: computeMoMGrowth(newThisMonth, newLastMonth),
  };
}

/**
 * Total communities count + new this month + MoM growth.
 */
export async function getCommunityStats(now: Date = new Date()) {
  const thisMonth = getCalendarMonthRange(now, 0);
  const lastMonth = getCalendarMonthRange(now, -1);

  const [total, thisCount, lastCount] = await Promise.all([
    queryOne<CountRow>`SELECT COUNT(*)::int AS count FROM communities`,
    queryOne<CountRow>`
      SELECT COUNT(*)::int AS count
      FROM communities
      WHERE created_at >= ${thisMonth.start.toISOString()}
        AND created_at < ${thisMonth.end.toISOString()}
    `,
    queryOne<CountRow>`
      SELECT COUNT(*)::int AS count
      FROM communities
      WHERE created_at >= ${lastMonth.start.toISOString()}
        AND created_at < ${lastMonth.end.toISOString()}
    `,
  ]);

  const newThisMonth = thisCount?.count ?? 0;
  const newLastMonth = lastCount?.count ?? 0;
  return {
    total: total?.count ?? 0,
    newThisMonth,
    growth: computeMoMGrowth(newThisMonth, newLastMonth),
  };
}

/**
 * Cumulative users + communities, day-by-day, for the last 90 days.
 * Both series live on the same chart — see PlatformDashboardChart.
 */
export async function getGrowthSeries90Days(
  now: Date = new Date()
): Promise<PlatformGrowthPoint[]> {
  const today = startOfDay(now);
  const startDay = new Date(today.getTime() - 89 * DAY_MS);

  const [users, communities, totalUsers, totalCommunities] = await Promise.all([
    query<{ created_at: Date }>`
      SELECT created_at
      FROM profiles
      WHERE created_at >= ${startDay.toISOString()}
    `,
    query<{ created_at: Date }>`
      SELECT created_at
      FROM communities
      WHERE created_at >= ${startDay.toISOString()}
    `,
    queryOne<CountRow>`SELECT COUNT(*)::int AS count FROM profiles`,
    queryOne<CountRow>`SELECT COUNT(*)::int AS count FROM communities`,
  ]);

  const days: PlatformGrowthPoint[] = [];
  for (let i = 0; i < 90; i++) {
    const d = new Date(startDay.getTime() + i * DAY_MS);
    days.push({
      date: formatDate(d),
      users: totalUsers?.count ?? 0,
      communities: totalCommunities?.count ?? 0,
    });
  }

  // Walk backward: each event in the window means the count was 1 lower
  // on every day at-or-before the event day.
  for (const u of users) {
    const idx = dayIndex(u.created_at, startDay, today);
    if (idx === null) continue;
    for (let i = 0; i <= idx; i++) days[i].users -= 1;
  }
  for (const c of communities) {
    const idx = dayIndex(c.created_at, startDay, today);
    if (idx === null) continue;
    for (let i = 0; i <= idx; i++) days[i].communities -= 1;
  }

  for (const d of days) {
    if (d.users < 0) d.users = 0;
    if (d.communities < 0) d.communities = 0;
  }
  return days;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayIndex(at: Date, startDay: Date, today: Date): number | null {
  const day = startOfDay(new Date(at));
  if (day.getTime() < startDay.getTime() || day.getTime() > today.getTime()) {
    return null;
  }
  return Math.round((day.getTime() - startDay.getTime()) / DAY_MS);
}
