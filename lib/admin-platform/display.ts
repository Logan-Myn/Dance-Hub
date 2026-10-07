// Small display helpers for the platform admin. Dates are shown in UTC so the
// server and the browser print the same day.

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
const MONTH_YEAR = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "2 Oct 2026". */
export function formatAdminDate(date: Date): string {
  return DAY.format(date);
}

function monthStart(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)) : null;
}

/** "2026-05" to "May" for chart axes; anything else is returned as is. */
export function monthLabel(key: string): string {
  const d = monthStart(key);
  return d ? MONTH.format(d) : key;
}

/** "2026-05" to "May 2026" for tooltips. */
export function monthLongLabel(key: string): string {
  const d = monthStart(key);
  return d ? MONTH_YEAR.format(d) : key;
}

/** "2026-10-05" to "5 Oct". */
export function dayLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return m ? DAY_MONTH.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))) : key;
}

export type Trend = 'up' | 'down' | 'flat';

/** Direction of a percentage change. */
export function trendOf(percent: number): Trend {
  return percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat';
}

/** "+12%", "-5%", "0%". */
export function percentText(percent: number): string {
  const rounded = Math.round(percent);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}
