import { getCalendarMonthRange, computeMoMGrowth, getMonthlyRevenue, getRevenueChart6Months } from '@/lib/admin-dashboard/stats';

const mockChargesList = jest.fn();
const mockAccountsRetrieve = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    accounts: { retrieve: (...a: unknown[]) => mockAccountsRetrieve(...a) },
    charges: { list: (...a: unknown[]) => mockChargesList(...a) },
  },
}));

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

describe('getMonthlyRevenue', () => {
  beforeEach(() => {
    mockChargesList.mockReset();
    mockAccountsRetrieve.mockReset();
  });

  it('returns 0/0 when stripeAccountId is null', async () => {
    const result = await getMonthlyRevenue(null, new Date(2026, 3, 15));
    expect(result).toEqual({ monthlyRevenue: 0, revenueGrowth: 0 });
    expect(mockAccountsRetrieve).not.toHaveBeenCalled();
  });

  it('returns 0/0 when account is not charges_enabled', async () => {
    mockAccountsRetrieve.mockResolvedValueOnce({ charges_enabled: false });
    const result = await getMonthlyRevenue('acct_x', new Date(2026, 3, 15));
    expect(result).toEqual({ monthlyRevenue: 0, revenueGrowth: 0 });
  });

  it('sums succeeded charges and computes MoM', async () => {
    mockAccountsRetrieve.mockResolvedValueOnce({ charges_enabled: true });
    mockChargesList
      .mockResolvedValueOnce({ data: [
        { status: 'succeeded', amount: 5000 },
        { status: 'succeeded', amount: 3000 },
        { status: 'failed',    amount: 1000 },
      ] })
      .mockResolvedValueOnce({ data: [
        { status: 'succeeded', amount: 4000 },
      ] });
    const result = await getMonthlyRevenue('acct_x', new Date(2026, 3, 15));
    expect(result.monthlyRevenue).toBe(80);
    expect(result.revenueGrowth).toBe(100);
  });

  it('falls back to 0/0 when accounts.retrieve throws', async () => {
    mockAccountsRetrieve.mockRejectedValueOnce(new Error('stripe down'));
    const result = await getMonthlyRevenue('acct_x', new Date(2026, 3, 15));
    expect(result).toEqual({ monthlyRevenue: 0, revenueGrowth: 0 });
  });
});

describe('getRevenueChart6Months', () => {
  beforeEach(() => {
    mockChargesList.mockReset();
    mockAccountsRetrieve.mockReset();
  });

  it('returns 6 zero points when stripeAccountId is null', async () => {
    const result = await getRevenueChart6Months(null, new Date(2026, 3, 15));
    expect(result).toHaveLength(6);
    expect(result.every((p) => p.revenue === 0)).toBe(true);
    expect(result[result.length - 1].month).toBe('2026-04');
    expect(result[0].month).toBe('2025-11');
  });

  it('queries Stripe per month and sums succeeded charges', async () => {
    mockAccountsRetrieve.mockResolvedValueOnce({ charges_enabled: true });
    for (let i = 0; i < 6; i++) {
      mockChargesList.mockResolvedValueOnce({
        data: [{ status: 'succeeded', amount: (i + 1) * 1000 }],
      });
    }
    const result = await getRevenueChart6Months('acct_x', new Date(2026, 3, 15));
    expect(result.map((p) => p.revenue)).toEqual([10, 20, 30, 40, 50, 60]);
    expect(result.map((p) => p.month)).toEqual([
      '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04',
    ]);
  });

  it('returns zero points when account is not charges_enabled', async () => {
    mockAccountsRetrieve.mockResolvedValueOnce({ charges_enabled: false });
    const result = await getRevenueChart6Months('acct_x', new Date(2026, 3, 15));
    expect(result.every((p) => p.revenue === 0)).toBe(true);
    expect(mockChargesList).not.toHaveBeenCalled();
  });
});
