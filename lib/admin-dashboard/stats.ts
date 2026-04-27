/**
 * Calendar month range. start is inclusive (1st of month at 00:00 local),
 * end is exclusive (1st of the *next* month). offsetMonths shifts both by N.
 */
export function getCalendarMonthRange(
  now: Date = new Date(),
  offsetMonths: number = 0
): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 1);
  return { start, end };
}

/**
 * Rounded percentage change. previous=0 with current>0 returns 100
 * (no baseline; treated as full growth). Both 0 returns 0.
 */
export function computeMoMGrowth(current: number, previous: number): number {
  if (previous > 0) {
    return Math.round(((current - previous) / previous) * 100);
  }
  if (current > 0) return 100;
  return 0;
}
