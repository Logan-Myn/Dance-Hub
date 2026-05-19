import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * Format a UTC date in a specific IANA timezone.
 * Uses date-fns format string syntax (e.g. 'h:mm a', 'EEE, MMM d · h:mm a').
 */
export function formatInTz(
  date: Date | string,
  tz: string,
  fmt: string
): string {
  return formatInTimeZone(new Date(date), tz, fmt);
}

/**
 * Convert a naive "YYYY-MM-DDTHH:MM" string that lives in `sourceTz`
 * to a UTC Date. Use when teacher availability times (stored without
 * timezone info) need to become an absolute UTC instant.
 */
export function naiveToUtc(naiveDatetime: string, sourceTz: string): Date {
  return fromZonedTime(naiveDatetime, sourceTz);
}

/**
 * Return a short timezone offset label, e.g. "GMT+3".
 */
export function tzOffsetLabel(tz: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en', {
      timeZone: tz,
      timeZoneName: 'short',
    });
    const parts = formatter.formatToParts(new Date());
    return parts.find(p => p.type === 'timeZoneName')?.value ?? tz;
  } catch {
    return tz;
  }
}
