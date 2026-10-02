/**
 * @jest-environment node
 */
import { privateLessonFeePercentage } from '@/lib/private-lesson-fee';

const NOW = new Date('2026-10-02T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 3600 * 1000).toISOString();

describe('privateLessonFeePercentage (advertised on the landing page)', () => {
  it('is 0% during the first 30 days, whatever the size', () => {
    expect(privateLessonFeePercentage({ created_at: daysAgo(0), active_member_count: 5 }, NOW)).toBe(0);
    expect(privateLessonFeePercentage({ created_at: daysAgo(29.9), active_member_count: 500 }, NOW)).toBe(0);
  });

  it('is 8% under 50 members after the first 30 days', () => {
    expect(privateLessonFeePercentage({ created_at: daysAgo(30), active_member_count: 0 }, NOW)).toBe(8);
    expect(privateLessonFeePercentage({ created_at: daysAgo(400), active_member_count: 49 }, NOW)).toBe(8);
    expect(privateLessonFeePercentage({ created_at: daysAgo(400), active_member_count: null }, NOW)).toBe(8);
  });

  it('is 6% from 50 to 100 members', () => {
    expect(privateLessonFeePercentage({ created_at: daysAgo(400), active_member_count: 50 }, NOW)).toBe(6);
    expect(privateLessonFeePercentage({ created_at: daysAgo(400), active_member_count: 100 }, NOW)).toBe(6);
  });

  it('is 4% over 100 members', () => {
    expect(privateLessonFeePercentage({ created_at: daysAgo(400), active_member_count: 101 }, NOW)).toBe(4);
  });

  it('accepts a Date and a numeric string from the database', () => {
    expect(
      privateLessonFeePercentage({ created_at: new Date(daysAgo(400)), active_member_count: '120' }, NOW),
    ).toBe(4);
  });
});
