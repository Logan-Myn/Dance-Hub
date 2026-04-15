import { getQuota, checkCanSend } from '@/lib/broadcasts/quota';
import { queryOne } from '@/lib/db';

jest.mock('@/lib/db', () => ({
  queryOne: jest.fn(),
}));

const mockedQueryOne = queryOne as unknown as jest.Mock;

describe('getQuota', () => {
  beforeEach(() => mockedQueryOne.mockReset());

  it('returns VIP when community is_broadcast_vip=true', async () => {
    mockedQueryOne
      .mockResolvedValueOnce({ is_broadcast_vip: true })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ count: 3 });
    const result = await getQuota('c1');
    expect(result).toEqual({ tier: 'vip', used: 3, limit: null });
  });

  it('returns paid when active subscription exists', async () => {
    mockedQueryOne
      .mockResolvedValueOnce({ is_broadcast_vip: false })
      .mockResolvedValueOnce({ status: 'active' })
      .mockResolvedValueOnce({ count: 37 });
    const result = await getQuota('c1');
    expect(result).toEqual({ tier: 'paid', used: 37, limit: 200 });
  });

  it('returns free when no VIP, no active subscription', async () => {
    mockedQueryOne
      .mockResolvedValueOnce({ is_broadcast_vip: false })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ count: 4 });
    const result = await getQuota('c1');
    expect(result).toEqual({ tier: 'free', used: 4, limit: 10 });
  });

  it('returns free when subscription is past_due', async () => {
    mockedQueryOne
      .mockResolvedValueOnce({ is_broadcast_vip: false })
      .mockResolvedValueOnce({ status: 'past_due' })
      .mockResolvedValueOnce({ count: 2 });
    const result = await getQuota('c1');
    expect(result.tier).toBe('free');
    expect(result.limit).toBe(10);
  });
});

describe('checkCanSend', () => {
  beforeEach(() => mockedQueryOne.mockReset());

  it('allows VIP unconditionally', async () => {
    mockedQueryOne
      .mockResolvedValueOnce({ is_broadcast_vip: true })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ count: 500 });
    await expect(checkCanSend('c1')).resolves.toEqual({ allowed: true });
  });

  it('rejects free tier at 10/10 used', async () => {
    mockedQueryOne
      .mockResolvedValueOnce({ is_broadcast_vip: false })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ count: 10 });
    await expect(checkCanSend('c1')).resolves.toEqual({
      allowed: false,
      reason: 'quota_exhausted',
      quota: { tier: 'free', used: 10, limit: 10 },
    });
  });

  it('rejects paid tier at soft cap 200/200', async () => {
    mockedQueryOne
      .mockResolvedValueOnce({ is_broadcast_vip: false })
      .mockResolvedValueOnce({ status: 'active' })
      .mockResolvedValueOnce({ count: 200 });
    await expect(checkCanSend('c1')).resolves.toEqual({
      allowed: false,
      reason: 'soft_cap_reached',
      quota: { tier: 'paid', used: 200, limit: 200 },
    });
  });

  it('allows free tier at 9/10', async () => {
    mockedQueryOne
      .mockResolvedValueOnce({ is_broadcast_vip: false })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ count: 9 });
    await expect(checkCanSend('c1')).resolves.toEqual({ allowed: true });
  });
});
