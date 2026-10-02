/**
 * Broadcast HTML is written by a community owner and shown on our own origin
 * (the archive page, which platform admins also open) as well as sent to
 * members. It is sanitized before it is stored, sent or returned.
 */
import { POST } from '@/app/api/community/[communitySlug]/broadcasts/route';
import { POST as testPOST } from '@/app/api/community/[communitySlug]/broadcasts/test/route';
import { GET as getOne } from '@/app/api/community/[communitySlug]/broadcasts/[broadcastId]/route';
import { authorizeBroadcastAccess } from '@/lib/broadcasts/auth';
import { queryOne, sql } from '@/lib/db';
import { checkCanSend } from '@/lib/broadcasts/quota';
import { getActiveRecipientsForCommunity } from '@/lib/broadcasts/recipients';
import { runBroadcast } from '@/lib/broadcasts/sender';

jest.mock('@/lib/broadcasts/auth', () => ({ authorizeBroadcastAccess: jest.fn() }));
jest.mock('@/lib/db', () => {
  const sql = jest.fn() as jest.Mock & { json: (v: unknown) => unknown };
  sql.json = (v: unknown) => v;
  return { queryOne: jest.fn(), query: jest.fn(), sql };
});
jest.mock('@/lib/broadcasts/quota', () => ({ checkCanSend: jest.fn() }));
jest.mock('@/lib/broadcasts/recipients', () => ({ getActiveRecipientsForCommunity: jest.fn() }));
jest.mock('@/lib/broadcasts/sender', () => ({ runBroadcast: jest.fn() }));

const mockedQueryOne = queryOne as jest.Mock;
const mockedSql = sql as unknown as jest.Mock;
const mockedRun = runBroadcast as jest.Mock;

const community = { id: 'c1', name: 'Salsa', slug: 'salsa', created_by: 'u1', is_broadcast_vip: false };
const session = { user: { id: 'u1', email: 'owner@x.com', name: 'Owner' } };
const params = Promise.resolve({ communitySlug: 'salsa' });

const PAYLOAD = '<p>News</p><img src="x" onerror="fetch(\'/api/admin/users\')"><script>alert(1)</script>';
const CLEAN = '<p>News</p>';

const req = (body: unknown) =>
  new Request('http://localhost/api/community/salsa/broadcasts', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  jest.clearAllMocks();
  (authorizeBroadcastAccess as jest.Mock).mockResolvedValue({ ok: true, session, community });
  (checkCanSend as jest.Mock).mockResolvedValue({ allowed: true });
  (getActiveRecipientsForCommunity as jest.Mock).mockResolvedValue([
    { userId: 'm1', email: 'm1@x.com', displayName: 'M', unsubscribeToken: 't' },
  ]);
  mockedSql.mockResolvedValue([]);
  mockedRun.mockResolvedValue({ status: 'sent', resendBatchIds: [], successfulCount: 1, failedCount: 0, failedRecipients: [] });
});

describe('POST broadcasts', () => {
  it('stores and sends sanitized HTML', async () => {
    mockedQueryOne
      .mockResolvedValueOnce({ id: 'profile-1' }) // sender profile
      .mockResolvedValueOnce({ id: 'b1' }); // insert

    const res = await POST(
      req({ subject: 'Hi', htmlContent: PAYLOAD, editorJson: { type: 'doc' } }),
      { params }
    );
    expect(res.status).toBe(200);

    const insert = mockedQueryOne.mock.calls.find((c) =>
      (c[0] as string[]).join('?').includes('INSERT INTO email_broadcasts')
    )!;
    expect(insert).toContain(CLEAN);
    expect(insert.some((v: unknown) => typeof v === 'string' && v.includes('onerror'))).toBe(false);
    expect(mockedRun).toHaveBeenCalledWith(expect.objectContaining({ htmlContent: CLEAN }));
  });

  it('rejects HTML that is empty once sanitized', async () => {
    const res = await POST(
      req({ subject: 'Hi', htmlContent: '<script>alert(1)</script>', editorJson: { type: 'doc' } }),
      { params }
    );
    expect(res.status).toBe(400);
    expect(mockedRun).not.toHaveBeenCalled();
  });
});

describe('POST broadcasts/test', () => {
  it('sends sanitized HTML', async () => {
    mockedQueryOne.mockResolvedValueOnce({ unsubscribe_token: 't' });
    const res = await testPOST(req({ subject: 'Hi', htmlContent: PAYLOAD }), { params });
    expect(res.status).toBe(200);
    expect(mockedRun).toHaveBeenCalledWith(expect.objectContaining({ htmlContent: CLEAN }));
  });
});

describe('GET broadcasts/[broadcastId]', () => {
  it('returns sanitized HTML for rows stored before sanitizing', async () => {
    mockedQueryOne.mockResolvedValueOnce({ id: 'b1', subject: 'Hi', html_content: PAYLOAD });
    const res = await getOne(new Request('http://localhost'), {
      params: Promise.resolve({ communitySlug: 'salsa', broadcastId: 'b1' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).html_content).toBe(CLEAN);
  });
});
