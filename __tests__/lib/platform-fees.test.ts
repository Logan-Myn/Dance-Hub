/**
 * @jest-environment node
 */
import { membershipFeePercentage, isInLaunchPromo } from '@/lib/platform-fees';

// The landing page promises: 0% for the first 15 days, then 8% under 50
// members, 6% from 50 to 100, 4% above 100.
const NOW = new Date('2026-10-02T12:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;
const old = new Date(NOW - 90 * DAY).toISOString();

describe('membershipFeePercentage', () => {
  it.each([
    [0, 8],
    [1, 8],
    [49, 8],
    [50, 6],
    [75, 6],
    [100, 6],
    [101, 4],
    [500, 4],
  ])('%i members -> %i%%', (members, fee) => {
    expect(membershipFeePercentage({ created_at: old, active_member_count: members }, NOW)).toBe(fee);
  });

  it('treats a missing member count as zero', () => {
    expect(membershipFeePercentage({ created_at: old, active_member_count: null }, NOW)).toBe(8);
  });

  it('charges 0% during the first 15 days, whatever the size', () => {
    const young = new Date(NOW - 14 * DAY).toISOString();
    expect(membershipFeePercentage({ created_at: young, active_member_count: 10 }, NOW)).toBe(0);
    expect(membershipFeePercentage({ created_at: new Date(NOW - 10 * DAY), active_member_count: 200 }, NOW)).toBe(0);
  });

  it('ends the launch promo after 15 days', () => {
    expect(isInLaunchPromo(new Date(NOW - 15 * DAY - 1), NOW)).toBe(false);
    expect(isInLaunchPromo(new Date(NOW - 15 * DAY + 1000), NOW)).toBe(true);
  });

  it('charges the member tier on day 20, after the promo', () => {
    expect(membershipFeePercentage({ created_at: new Date(NOW - 20 * DAY), active_member_count: 10 }, NOW)).toBe(8);
  });
});
