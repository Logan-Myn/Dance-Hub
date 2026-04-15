import { POST, GET } from '@/app/api/community/[communitySlug]/broadcasts/route';
import { authorizeBroadcastAccess } from '@/lib/broadcasts/auth';
import { queryOne, query, sql } from '@/lib/db';
import { checkCanSend } from '@/lib/broadcasts/quota';
import { getActiveRecipientsForCommunity } from '@/lib/broadcasts/recipients';
import { runBroadcast } from '@/lib/broadcasts/sender';
import { NextResponse } from 'next/server';

jest.mock('@/lib/broadcasts/auth', () => ({
  authorizeBroadcastAccess: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  queryOne: jest.fn(),
  query: jest.fn(),
  sql: jest.fn(),
}));
jest.mock('@/lib/broadcasts/quota', () => ({ checkCanSend: jest.fn() }));
jest.mock('@/lib/broadcasts/recipients', () => ({
  getActiveRecipientsForCommunity: jest.fn(),
}));
jest.mock('@/lib/broadcasts/sender', () => ({ runBroadcast: jest.fn() }));

const mockedAuthz = authorizeBroadcastAccess as jest.Mock;
const mockedQueryOne = queryOne as jest.Mock;
const mockedQuery = query as jest.Mock;
const mockedSql = sql as unknown as jest.Mock;
const mockedCanSend = checkCanSend as jest.Mock;
const mockedRecipients = getActiveRecipientsForCommunity as jest.Mock;
const mockedRun = runBroadcast as jest.Mock;

const ownerSession = { user: { id: 'u1', email: 'o@o.com' } };
const community = {
  id: 'c1',
  name: 'Salsa',
  slug: 'salsa',
  created_by: 'u1',
  is_broadcast_vip: false,
};

const grantAccess = () =>
  mockedAuthz.mockResolvedValueOnce({ ok: true, session: ownerSession, community });

const denyAccess = (status: number) =>
  mockedAuthz.mockResolvedValueOnce({
    ok: false,
    response: NextResponse.json({ error: 'denied' }, { status }),
  });

const body = {
  subject: 'Hello',
  htmlContent: '<p>Hello</p>',
  editorJson: { type: 'doc', content: [] },
  previewText: 'Hi',
};

const makeReq = (b: unknown = body) =>
  new Request('http://localhost/api/community/salsa/broadcasts', {
    method: 'POST',
    body: JSON.stringify(b),
    headers: { 'content-type': 'application/json' },
  });

describe('POST broadcasts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSql.mockResolvedValue([]);
  });

  it('returns auth response when access denied (e.g. 401/403/404)', async () => {
    denyAccess(403);
    const res = await POST(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(403);
  });

  it('402 when free quota exhausted', async () => {
    grantAccess();
    mockedCanSend.mockResolvedValueOnce({
      allowed: false,
      reason: 'quota_exhausted',
      quota: { tier: 'free', used: 10, limit: 10 },
    });
    const res = await POST(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(402);
  });

  it('429 when paid soft cap reached', async () => {
    grantAccess();
    mockedCanSend.mockResolvedValueOnce({
      allowed: false,
      reason: 'soft_cap_reached',
      quota: { tier: 'paid', used: 200, limit: 200 },
    });
    const res = await POST(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(429);
  });

  it('422 when no eligible recipients', async () => {
    grantAccess();
    mockedCanSend.mockResolvedValueOnce({ allowed: true });
    mockedQueryOne
      .mockResolvedValueOnce({ id: 'profile-uuid' }) // sender profile lookup
      .mockResolvedValueOnce({ id: 'b-new' });        // INSERT … RETURNING id
    mockedRecipients.mockResolvedValueOnce([]);
    const res = await POST(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(422);
  });

  it('happy path inserts the broadcast and runs the send', async () => {
    grantAccess();
    mockedCanSend.mockResolvedValueOnce({ allowed: true });
    mockedQueryOne
      .mockResolvedValueOnce({ id: 'profile-uuid' })
      .mockResolvedValueOnce({ id: 'b-new' });
    mockedRecipients.mockResolvedValueOnce([
      { userId: 'u2', email: 'a@a.com', displayName: 'A', unsubscribeToken: 't' },
    ]);
    mockedRun.mockResolvedValueOnce({
      status: 'sent',
      resendBatchIds: ['b1'],
      successfulCount: 1,
      failedCount: 0,
    });

    const res = await POST(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(
      expect.objectContaining({
        broadcastId: 'b-new',
        recipientCount: 1,
        status: 'sent',
      })
    );
    expect(mockedRun).toHaveBeenCalledTimes(1);
  });

  it('marks the row failed and returns 500 when runBroadcast throws', async () => {
    grantAccess();
    mockedCanSend.mockResolvedValueOnce({ allowed: true });
    mockedQueryOne
      .mockResolvedValueOnce({ id: 'profile-uuid' })
      .mockResolvedValueOnce({ id: 'b-new' });
    mockedRecipients.mockResolvedValueOnce([
      { userId: 'u2', email: 'a@a.com', displayName: 'A', unsubscribeToken: 't' },
    ]);
    mockedRun.mockRejectedValueOnce(new Error('resend down'));

    const res = await POST(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(500);
    // last sql call should be the cleanup UPDATE marking the row failed
    const lastCall = mockedSql.mock.calls[mockedSql.mock.calls.length - 1];
    const sqlText = lastCall[0].join('?');
    expect(sqlText).toMatch(/UPDATE email_broadcasts/);
    expect(sqlText).toMatch(/SET status = .*'failed'/);
  });
});

describe('GET broadcasts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns auth response when access denied', async () => {
    denyAccess(401);
    const res = await GET(new Request('http://localhost/x'), {
      params: { communitySlug: 'salsa' },
    });
    expect(res.status).toBe(401);
  });

  it('returns list of broadcasts for owner', async () => {
    grantAccess();
    mockedQuery.mockResolvedValueOnce([
      {
        id: 'b1',
        subject: 'S',
        recipient_count: 5,
        status: 'sent',
        sent_at: null,
        created_at: 'now',
      },
    ]);
    const res = await GET(new Request('http://localhost/x'), {
      params: { communitySlug: 'salsa' },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.broadcasts).toHaveLength(1);
  });
});
