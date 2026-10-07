import { dayLabel, formatAdminDate, monthLabel, monthLongLabel, percentText, trendOf } from '@/lib/admin-platform/display';

describe('platform admin display helpers', () => {
  it('prints dates day first, in UTC', () => {
    expect(formatAdminDate(new Date('2026-10-02T23:30:00Z'))).toBe('2 Oct 2026');
  });

  it('turns month keys into short and long names', () => {
    expect(monthLabel('2026-05')).toBe('May');
    expect(monthLabel('2026-12')).toBe('Dec');
    expect(monthLongLabel('2026-01')).toBe('January 2026');
    expect(monthLabel('not a month')).toBe('not a month');
  });

  it('turns day keys into "5 Oct"', () => {
    expect(dayLabel('2026-10-05')).toBe('5 Oct');
    expect(dayLabel('oops')).toBe('oops');
  });

  it('reads the direction and text of a change', () => {
    expect(trendOf(12)).toBe('up');
    expect(trendOf(-3)).toBe('down');
    expect(trendOf(0)).toBe('flat');
    expect(percentText(150)).toBe('+150%');
    expect(percentText(-4.6)).toBe('-5%');
    expect(percentText(0)).toBe('0%');
  });
});
