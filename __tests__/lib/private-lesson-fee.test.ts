/**
 * @jest-environment node
 */
import { platformFeePercent, privateLessonFeePercentage } from '@/lib/private-lesson-fee';

const NOW = new Date('2026-10-02T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 3600 * 1000).toISOString();

describe('privateLessonFeePercentage (advertised on the landing page)', () => {
  it('is 0% during the first 15 days, whatever the size', () => {
    expect(privateLessonFeePercentage({ created_at: daysAgo(0), active_member_count: 5 }, NOW)).toBe(0);
    expect(privateLessonFeePercentage({ created_at: daysAgo(14.9), active_member_count: 500 }, NOW)).toBe(0);
  });

  it('is 8% under 50 members after the first 15 days', () => {
    expect(privateLessonFeePercentage({ created_at: daysAgo(15), active_member_count: 0 }, NOW)).toBe(8);
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

describe('platformFeePercent (pure, reusable by membership billing)', () => {
  it('takes the community age and size explicitly', () => {
    expect(platformFeePercent({ communityCreatedAt: daysAgo(10), activeMemberCount: 500, now: NOW })).toBe(0);
    expect(platformFeePercent({ communityCreatedAt: daysAgo(31), activeMemberCount: 49, now: NOW })).toBe(8);
    expect(platformFeePercent({ communityCreatedAt: daysAgo(31), activeMemberCount: 50, now: NOW })).toBe(6);
    expect(platformFeePercent({ communityCreatedAt: daysAgo(31), activeMemberCount: 101, now: NOW })).toBe(4);
  });
});
