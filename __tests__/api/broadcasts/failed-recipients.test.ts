/**
 * Publishing answers right away with the broadcast id and status 'sending';
 * the send runs after the response (next/server `after`), so slow retries
 * can't outlive the proxy's request timeout and make the owner publish
 * twice. The send records its outcome on the row, including who missed it,
 * and the status route reports it for the composer to poll.
 */
import { POST } from '@/app/api/community/[communitySlug]/broadcasts/route';
import { GET as getStatus } from '@/app/api/community/[communitySlug]/broadcasts/[broadcastId]/status/route';
import { runBroadcast } from '@/lib/broadcasts/sender';

// Collect after() callbacks so a test decides when "after the response" is.
const mockAfter: Array<() => unknown> = [];
jest.mock('next/server', () => ({
  ...jest.requireActual('next/server'),
  after: (fn: () => unknown) => {
    mockAfter.push(fn);
  },
}));
const runAfter = async () => {
  while (mockAfter.length) await mockAfter.shift()!();
};

jest.mock('@/lib/broadcasts/auth', () => ({
  authorizeBroadcastAccess: jest.fn(async () => ({
    ok: true,
    session: { user: { id: 'u1', email: 'o@o.com' } },
    community: { id: 'c1', name: 'Salsa', slug: 'salsa', created_by: 'u1' },
  })),
}));
const mockSql = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: Object.assign((...a: unknown[]) => mockSql(...a), { json: (v: unknown) => ({ json: v }) }),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  query: jest.fn(),
}));
jest.mock('@/lib/broadcasts/quota', () => ({ checkCanSend: jest.fn(async () => ({ allowed: true })) }));
jest.mock('@/lib/broadcasts/recipients', () => ({
  getActiveRecipientsForCommunity: jest.fn(async () => [
    { userId: 'm1', email: 'a@example.com', displayName: 'A', unsubscribeToken: 't1' },
    { userId: 'm2', email: 'b@example.com', displayName: 'B', unsubscribeToken: 't2' },
  ]),
}));
jest.mock('@/lib/broadcasts/sender', () => ({ runBroadcast: jest.fn() }));
const mockRun = runBroadcast as jest.Mock;

const text = (c: unknown[]) => (c[0] as string[]).join('?');
const post = () =>
  POST(
    new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ subject: 'Hi', htmlContent: '<p>Hi</p>', editorJson: { type: 'doc' } }),
    }),
    { params: Promise.resolve({ communitySlug: 'salsa' }) }
  );

const partial = {
  status: 'partial_failure',
  resendBatchIds: ['e1'],
  errorMessage: 'Too many requests',
  successfulCount: 1,
  failedCount: 1,
  failedRecipients: [{ userId: 'm2', email: 'b@example.com', error: 'Too many requests' }],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAfter.length = 0;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockSql.mockResolvedValue([]);
  mockQueryOne.mockImplementation(async (strings: string[]) =>
    /FROM profiles/.test(strings.join('?')) ? { id: 'p1' } : { id: 'b1' }
  );
  mockRun.mockResolvedValue(partial);
});

describe('POST broadcasts', () => {
  it('answers with the broadcast id and status sending before anything is sent', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ broadcastId: 'b1', recipientCount: 2, status: 'sending' });
    expect(mockRun).not.toHaveBeenCalled();
    expect(mockAfter).toHaveLength(1);
  });

  it('records the outcome and the failed recipients after the response', async () => {
    await post();
    await runAfter();

    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({ broadcastId: 'b1', fromName: 'Salsa' }));
    const statusWrite = mockSql.mock.calls.find((c) => /SET status = /.test(text(c)))!;
    expect(statusWrite.slice(1)).toContain('partial_failure');
    const write = mockSql.mock.calls.find((c) => /failed_recipients/.test(text(c)))!;
    expect(write.slice(1)).toEqual([{ json: partial.failedRecipients }, 'b1']);
  });

  it('still saves the status when recording failed recipients fails', async () => {
    mockSql.mockImplementation(async (strings: string[]) => {
      if (/failed_recipients/.test(strings.join('?'))) throw new Error('column "failed_recipients" does not exist');
      return [];
    });
    await post();
    await runAfter();
    const statusWrite = mockSql.mock.calls.find((c) => /SET status = /.test(text(c)))!;
    expect(statusWrite.slice(1)).toContain('partial_failure');
  });

  it('marks the broadcast failed when the send throws', async () => {
    mockRun.mockRejectedValue(new Error('provider down'));
    await post();
    await runAfter();
    const last = mockSql.mock.calls[mockSql.mock.calls.length - 1];
    expect(text(last)).toMatch(/SET status = 'failed'/);
    expect(text(last)).toMatch(/status = 'sending'/);
  });

  it('does not write failed recipients when everyone got it', async () => {
    mockRun.mockResolvedValue({ ...partial, status: 'sent', failedCount: 0, successfulCount: 2, failedRecipients: [] });
    await post();
    await runAfter();
    expect(mockSql.mock.calls.some((c) => /failed_recipients/.test(text(c)))).toBe(false);
  });
});

describe('GET broadcasts/[broadcastId]/status', () => {
  const get = () =>
    getStatus(new Request('http://x'), { params: Promise.resolve({ communitySlug: 'salsa', broadcastId: 'b1' }) });

  it('reports the status and how many members missed it', async () => {
    mockQueryOne.mockResolvedValueOnce({ status: 'partial_failure', recipient_count: 600, failed_count: 400 });
    const res = await get();
    expect(await res.json()).toEqual({ status: 'partial_failure', recipientCount: 600, failedCount: 400 });
    const [call] = mockQueryOne.mock.calls;
    expect(call.slice(1)).toEqual(['b1', 'c1']); // scoped to the community
  });

  it('returns 404 for a broadcast of another community', async () => {
    mockQueryOne.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(404);
  });
});
