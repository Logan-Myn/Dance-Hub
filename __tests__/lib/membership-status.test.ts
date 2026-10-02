/**
 * Who counts as a member. A cancelled membership keeps access until its paid
 * period ends, but only a real (active) membership has a paid period: a
 * pre-registered or pending row marked 'canceling' must not get access.
 *
 * @jest-environment node
 */
import { toMembershipStatus } from '@/lib/community-data';

jest.mock('@/lib/db', () => ({ query: jest.fn(), queryOne: jest.fn() }));

const future = new Date(Date.now() + 30 * 86400_000);

it('keeps an active member who cancelled in until the period ends', () => {
  expect(
    toMembershipStatus({ status: 'active', subscription_status: 'canceling', current_period_end: future }).isMember
  ).toBe(true);
});

it.each(['pre_registered', 'pending_pre_registration', 'pending', 'inactive'])(
  'gives no grace period to a %s row marked canceling',
  (status) => {
    const result = toMembershipStatus({ status, subscription_status: 'canceling', current_period_end: future });
    expect(result.isMember).toBe(false);
  }
);

it('still reports a pre-registered row as pre-registered', () => {
  expect(
    toMembershipStatus({ status: 'pre_registered', subscription_status: 'canceling', current_period_end: future })
  ).toMatchObject({ isMember: false, isPreRegistered: true });
});
