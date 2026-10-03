/**
 * @jest-environment node
 *
 * The calendar's week is "Sunday 00:00 to the next Sunday 00:00 in the
 * viewer's timezone", sent to the server as UTC instants. Every test passes
 * explicit instants and an explicit timezone, so the result must not depend
 * on the machine's TZ (try `TZ=Pacific/Kiritimati bun run test -- calendar-week`).
 */
import {
  addDaysToKey,
  dateKeyInTz,
  defaultClassStart,
  formatDayKey,
  hourInTz,
  initialCalendarRange,
  isInRange,
  parseRangeParams,
  rangeContains,
  weekDayKeys,
  weekRangeUtc,
  weekStartKey,
  zonedTimeToUtc,
} from '@/lib/calendar-week';

const NY = 'America/New_York';
const TALLINN = 'Europe/Tallinn';

// Saturday 3 Oct 2026, 20:00 in New York (EDT, UTC-4).
const SAT_8PM_NY = new Date('2026-10-04T00:00:00Z');

describe('weekStartKey', () => {
  it('uses the calendar date in the viewer timezone, not UTC', () => {
    // Saturday 21:30 in New York, already Sunday in UTC and in Tallinn.
    const now = new Date('2026-10-04T01:30:00Z');
    expect(weekStartKey(dateKeyInTz(now, NY))).toBe('2026-09-27');
    expect(weekStartKey(dateKeyInTz(now, 'UTC'))).toBe('2026-10-04');
    expect(weekStartKey(dateKeyInTz(now, TALLINN))).toBe('2026-10-04');
  });

  it('moves by whole weeks with the offset', () => {
    expect(weekStartKey('2026-10-01', 1)).toBe('2026-10-04');
    expect(weekStartKey('2026-10-01', -1)).toBe('2026-09-20');
    expect(weekStartKey('2026-10-04')).toBe('2026-10-04');
  });
});

describe('weekRangeUtc', () => {
  it('is Sunday 00:00 to the next Sunday 00:00 in the timezone, as UTC instants', () => {
    const range = weekRangeUtc('2026-09-27', NY);
    expect(range.start.toISOString()).toBe('2026-09-27T04:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-10-04T04:00:00.000Z');
  });

  it('follows a DST change inside the week', () => {
    // New York leaves DST on Sunday 1 Nov 2026.
    const range = weekRangeUtc('2026-11-01', NY);
    expect(range.start.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-11-08T05:00:00.000Z');
  });

  it.each([
    // Clocks jump from 00:00 to 01:00, so Sunday starts at 01:00 local.
    ['America/Santiago', '2026-09-06', '2026-09-06T04:00:00.000Z'],
    ['Asia/Beirut', '2026-03-29', '2026-03-28T22:00:00.000Z'],
  ])('starts on Sunday when %s skips midnight', (tz, sunday, firstInstant) => {
    const range = weekRangeUtc(sunday, tz);
    expect(range.start.toISOString()).toBe(firstInstant);
    expect(dateKeyInTz(range.start, tz)).toBe(sunday);
    // The week before ends exactly there, so nothing falls between them.
    expect(weekRangeUtc(addDaysToKey(sunday, -7), tz).end.toISOString()).toBe(firstInstant);
  });

  it('keeps a Saturday 20:00 New York class in its own week, on Saturday', () => {
    const week = weekRangeUtc('2026-09-27', NY);
    const nextWeek = weekRangeUtc('2026-10-04', NY);
    expect(isInRange(SAT_8PM_NY, week)).toBe(true);
    expect(isInRange(SAT_8PM_NY, nextWeek)).toBe(false);
    expect(dateKeyInTz(SAT_8PM_NY, NY)).toBe('2026-10-03');
    expect(hourInTz(SAT_8PM_NY, NY)).toBe(20);
    expect(weekDayKeys('2026-09-27')).toContain('2026-10-03');
  });

  it('is half-open: the next week starts exactly where this one ends', () => {
    const week = weekRangeUtc('2026-09-27', TALLINN);
    expect(isInRange(week.start, week)).toBe(true);
    expect(isInRange(week.end, week)).toBe(false);
  });
});

describe('weekDayKeys / addDaysToKey / formatDayKey', () => {
  it('lists the seven calendar dates of the week', () => {
    expect(weekDayKeys('2026-09-27')).toEqual([
      '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30',
      '2026-10-01', '2026-10-02', '2026-10-03',
    ]);
    expect(addDaysToKey('2026-12-29', 7)).toBe('2027-01-05');
  });

  it('formats a calendar date without shifting it', () => {
    expect(formatDayKey('2026-10-03', 'EEE d MMM')).toBe('Sat 3 Oct');
  });
});

describe('zonedTimeToUtc', () => {
  it('reads a grid slot as wall-clock time in the viewer timezone', () => {
    expect(zonedTimeToUtc('2026-10-03', 20, 30, NY).toISOString()).toBe('2026-10-04T00:30:00.000Z');
    expect(zonedTimeToUtc('2026-10-04', 1, 0, TALLINN).toISOString()).toBe('2026-10-03T22:00:00.000Z');
  });
});

describe('defaultClassStart', () => {
  // Thursday 1 Oct 2026, 12:10 in New York.
  const NOW = new Date('2026-10-01T16:10:00Z');

  it('is the next half hour today, in the viewer timezone', () => {
    expect(defaultClassStart(null, NOW, NY).toISOString()).toBe('2026-10-01T16:30:00.000Z');
    expect(defaultClassStart('2026-10-01', NOW, NY).toISOString()).toBe('2026-10-01T16:30:00.000Z');
    // Exactly on a half hour: the next one, never now.
    expect(defaultClassStart(null, new Date('2026-10-01T16:30:00Z'), NY).toISOString()).toBe('2026-10-01T17:00:00.000Z');
  });

  it('moves that time to a later day', () => {
    expect(defaultClassStart('2026-10-03', NOW, NY).toISOString()).toBe('2026-10-03T16:30:00.000Z');
  });

  it('never starts in the past for an earlier day', () => {
    expect(defaultClassStart('2026-09-27', NOW, NY).toISOString()).toBe('2026-10-01T16:30:00.000Z');
  });

  it('rolls over to tomorrow late at night', () => {
    // Thursday 23:50 in Tallinn -> Friday 00:00.
    expect(defaultClassStart(null, new Date('2026-10-01T20:50:00Z'), TALLINN).toISOString()).toBe('2026-10-01T21:00:00.000Z');
  });

  it('rounds wall-clock time where the offset is not whole hours', () => {
    // 12:10 in Kathmandu (UTC+5:45) -> 12:30 there.
    expect(defaultClassStart(null, new Date('2026-10-01T06:25:00Z'), 'Asia/Kathmandu').toISOString()).toBe('2026-10-01T06:45:00.000Z');
  });
});

describe('initialCalendarRange', () => {
  const zones = ['Pacific/Kiritimati', 'Etc/GMT+12', 'Pacific/Honolulu', NY, 'UTC', TALLINN, 'Asia/Tokyo'];
  const nows = [
    '2026-10-03T09:30:00Z', // Saturday morning UTC
    '2026-10-04T00:30:00Z', // just after Sunday 00:00 UTC
    '2026-10-04T10:30:00Z', // Sunday in Asia, still Saturday in Hawaii
    '2026-11-01T06:30:00Z', // New York DST change
  ];

  it.each(zones)('covers the current week of a viewer in %s', (tz) => {
    for (const iso of nows) {
      const now = new Date(iso);
      const initial = initialCalendarRange(now);
      expect(rangeContains(initial, weekRangeUtc(weekStartKey(dateKeyInTz(now, tz)), tz))).toBe(true);
    }
  });
});

describe('parseRangeParams', () => {
  it('accepts UTC instants', () => {
    const range = parseRangeParams('2026-09-27T04:00:00.000Z', '2026-10-04T04:00:00.000Z');
    expect(range?.start.toISOString()).toBe('2026-09-27T04:00:00.000Z');
    expect(range?.end.toISOString()).toBe('2026-10-04T04:00:00.000Z');
  });

  it('accepts an explicit offset', () => {
    const range = parseRangeParams('2026-09-27T00:00:00-04:00', '2026-10-04T00:00:00-04:00');
    expect(range?.start.toISOString()).toBe('2026-09-27T04:00:00.000Z');
  });

  it('reads bare dates from older clients as whole UTC days, end day included', () => {
    const range = parseRangeParams('2026-09-27', '2026-10-03');
    expect(range?.start.toISOString()).toBe('2026-09-27T00:00:00.000Z');
    expect(range?.end.toISOString()).toBe('2026-10-04T00:00:00.000Z');
  });

  it.each([
    ['garbage', '2026-10-04T04:00:00Z'],
    ['2026-09-27T00:00:00', '2026-10-04T00:00:00'], // no offset: ambiguous
    ['2026-10-04T04:00:00Z', '2026-09-27T04:00:00Z'], // end before start
    ['2026-02-31', '2026-03-05'],
  ])('rejects %s .. %s', (start, end) => {
    expect(parseRangeParams(start, end)).toBeNull();
  });
});
