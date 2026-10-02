/**
 * @jest-environment node
 */
import { lessonTimeForEmail, slotStartsAt } from '@/lib/private-lesson-booking';

jest.mock('@/lib/db', () => ({ queryOne: jest.fn(), query: jest.fn(), sql: jest.fn() }));

describe('slotStartsAt', () => {
  it("reads the slot's date and time in the teacher's timezone", () => {
    expect(
      slotStartsAt({ id: 's', availability_date: '2026-11-10', start_time: '18:00:00', teacher_timezone: 'America/New_York' }).toISOString(),
    ).toBe('2026-11-10T23:00:00.000Z');
  });
});

describe('lessonTimeForEmail', () => {
  const when = new Date('2026-11-10T23:00:00Z');

  it('formats the date and the time with a timezone label in the given timezone', () => {
    expect(lessonTimeForEmail(when, 'Europe/Tallinn')).toEqual({
      date: 'Wednesday, November 11, 2026',
      time: '1:00 AM GMT+2',
    });
  });

  it('falls back to UTC for a missing or unknown timezone', () => {
    expect(lessonTimeForEmail(when, null)).toEqual({ date: 'Tuesday, November 10, 2026', time: '11:00 PM UTC' });
    expect(lessonTimeForEmail(when, 'Not/AZone')).toEqual({ date: 'Tuesday, November 10, 2026', time: '11:00 PM UTC' });
  });
});
