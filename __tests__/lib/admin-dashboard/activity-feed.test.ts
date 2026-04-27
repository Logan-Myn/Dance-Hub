import { mergeActivityEvents, getRecentFailedPayments } from '@/lib/admin-dashboard/activity-feed';
import type { ActivityEvent } from '@/lib/admin-dashboard/types';

const mockChargesList = jest.fn();
const mockAccountsRetrieve = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    accounts: { retrieve: (...a: unknown[]) => mockAccountsRetrieve(...a) },
    charges: { list: (...a: unknown[]) => mockChargesList(...a) },
  },
}));

const make = (overrides: Partial<ActivityEvent>): ActivityEvent =>
  ({
    type: 'join',
    at: new Date(2026, 3, 1),
    userId: 'u1',
    displayName: 'X',
    avatarUrl: null,
    ...overrides,
  } as ActivityEvent);

describe('mergeActivityEvents', () => {
  it('merges multiple lists, sorts DESC by at, caps at limit', () => {
    const a: ActivityEvent[] = [
      make({ at: new Date('2026-04-10T09:00:00Z'), userId: 'a1' }),
      make({ at: new Date('2026-04-05T09:00:00Z'), userId: 'a2' }),
    ];
    const b: ActivityEvent[] = [
      make({ at: new Date('2026-04-12T09:00:00Z'), userId: 'b1', type: 'cancel' }),
      make({ at: new Date('2026-04-08T09:00:00Z'), userId: 'b2', type: 'cancel' }),
    ];
    const result = mergeActivityEvents([a, b], 3);
    expect(result.map((e) => e.userId)).toEqual(['b1', 'a1', 'b2']);
  });

  it('returns empty array when all inputs empty', () => {
    expect(mergeActivityEvents([[], [], []], 10)).toEqual([]);
  });

  it('preserves stable order between same-timestamp events', () => {
    const t = new Date('2026-04-12T09:00:00Z');
    const a: ActivityEvent[] = [make({ at: t, userId: 'a1' })];
    const b: ActivityEvent[] = [make({ at: t, userId: 'b1' })];
    const result = mergeActivityEvents([a, b], 10);
    expect(result.map((e) => e.userId)).toEqual(['a1', 'b1']);
  });
});

describe('getRecentFailedPayments', () => {
  beforeEach(() => {
    mockChargesList.mockReset();
    mockAccountsRetrieve.mockReset();
  });

  it('returns [] when stripeAccountId is null', async () => {
    const result = await getRecentFailedPayments(null);
    expect(result).toEqual([]);
    expect(mockChargesList).not.toHaveBeenCalled();
  });

  it('returns [] when account is not charges_enabled', async () => {
    mockAccountsRetrieve.mockResolvedValueOnce({ charges_enabled: false });
    const result = await getRecentFailedPayments('acct_x');
    expect(result).toEqual([]);
  });

  it('maps failed charges to ActivityEvent rows', async () => {
    mockAccountsRetrieve.mockResolvedValueOnce({ charges_enabled: true });
    const t = new Date('2026-04-12T09:00:00Z');
    mockChargesList.mockResolvedValueOnce({
      data: [
        {
          status: 'failed',
          amount: 1500,
          created: Math.floor(t.getTime() / 1000),
          billing_details: { name: 'Anna Test' },
          metadata: { user_id: 'u1' },
        },
      ],
    });
    const result = await getRecentFailedPayments('acct_x');
    expect(result).toEqual([
      {
        type: 'failed_payment',
        at: t,
        userId: 'u1',
        displayName: 'Anna Test',
        amount: 15,
      },
    ]);
  });

  it('falls back to "Unknown" displayName when billing_details.name is missing', async () => {
    mockAccountsRetrieve.mockResolvedValueOnce({ charges_enabled: true });
    mockChargesList.mockResolvedValueOnce({
      data: [{ status: 'failed', amount: 1000, created: 1700000000, billing_details: {}, metadata: {} }],
    });
    const result = await getRecentFailedPayments('acct_x');
    expect(result[0].displayName).toBe('Unknown');
    expect(result[0].userId).toBeNull();
  });
});
