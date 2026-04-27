import { getCalendarMonthRange, computeMoMGrowth } from '@/lib/admin-dashboard/stats';

describe('getCalendarMonthRange', () => {
  it('returns start of current month and start of next month with offset 0', () => {
    const now = new Date(2026, 3, 15); // April 15, 2026
    const { start, end } = getCalendarMonthRange(now, 0);
    expect(start).toEqual(new Date(2026, 3, 1));
    expect(end).toEqual(new Date(2026, 4, 1));
  });

  it('returns previous month with offset -1', () => {
    const now = new Date(2026, 3, 15);
    const { start, end } = getCalendarMonthRange(now, -1);
    expect(start).toEqual(new Date(2026, 2, 1));
    expect(end).toEqual(new Date(2026, 3, 1));
  });

  it('handles year boundary (January)', () => {
    const now = new Date(2026, 0, 15);
    const { start, end } = getCalendarMonthRange(now, -1);
    expect(start).toEqual(new Date(2025, 11, 1));
    expect(end).toEqual(new Date(2026, 0, 1));
  });
});

describe('computeMoMGrowth', () => {
  it('returns positive % when current > previous', () => {
    expect(computeMoMGrowth(120, 100)).toBe(20);
  });
  it('returns negative % when current < previous', () => {
    expect(computeMoMGrowth(75, 100)).toBe(-25);
  });
  it('returns 0 when both are 0', () => {
    expect(computeMoMGrowth(0, 0)).toBe(0);
  });
  it('returns 100 when previous is 0 and current is non-zero', () => {
    expect(computeMoMGrowth(50, 0)).toBe(100);
  });
  it('rounds to integer', () => {
    expect(computeMoMGrowth(10.7, 10)).toBe(7);
  });
});
