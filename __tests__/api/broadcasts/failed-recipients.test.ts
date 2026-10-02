/**
 * A broadcast that only partly went out records who missed it, and the row
 * status is saved even if that extra write fails (e.g. before the migration
 * that adds failed_recipients has run).
 */
import { POST } from '@/app/api/community/[communitySlug]/broadcasts/route';
import { runBroadcast } from '@/lib/broadcasts/sender';

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
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockSql.mockResolvedValue([]);
  mockQueryOne.mockImplementation(async (strings: string[]) =>
    /FROM profiles/.test(strings.join('?')) ? { id: 'p1' } : { id: 'b1' }
  );
  mockRun.mockResolvedValue(partial);
});

it('stores the failed recipients on the broadcast row', async () => {
  const res = await post();
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ status: 'partial_failure', successfulCount: 1, failedCount: 1 });
  const write = mockSql.mock.calls.find((c) => /failed_recipients/.test(text(c)))!;
  expect(write.slice(1)).toEqual([{ json: partial.failedRecipients }, 'b1']);
});

it('still saves the status when recording failed recipients fails', async () => {
  mockSql.mockImplementation(async (strings: string[]) => {
    if (/failed_recipients/.test(strings.join('?'))) throw new Error('column "failed_recipients" does not exist');
    return [];
  });
  const res = await post();
  expect(res.status).toBe(200);
  const statusWrite = mockSql.mock.calls.find((c) => /SET status = /.test(text(c)))!;
  expect(statusWrite.slice(1)).toContain('partial_failure');
});

it('does not write failed recipients when everyone got it', async () => {
  mockRun.mockResolvedValue({ ...partial, status: 'sent', failedCount: 0, successfulCount: 2, failedRecipients: [] });
  await post();
  expect(mockSql.mock.calls.some((c) => /failed_recipients/.test(text(c)))).toBe(false);
});
