import { POST, GET } from '@/app/api/community/[communitySlug]/broadcasts/route';
import { getSession } from '@/lib/auth-session';
import { queryOne, query, sql } from '@/lib/db';
import { checkCanSend } from '@/lib/broadcasts/quota';
import { getActiveRecipientsForCommunity } from '@/lib/broadcasts/recipients';
import { runBroadcast } from '@/lib/broadcasts/sender';

jest.mock('@/lib/auth-session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/db', () => ({
  queryOne: jest.fn(),
  query: jest.fn(),
  sql: jest.fn(),
}));
jest.mock('@/lib/broadcasts/quota', () => ({ checkCanSend: jest.fn() }));
jest.mock('@/lib/broadcasts/recipients', () => ({ getActiveRecipientsForCommunity: jest.fn() }));
jest.mock('@/lib/broadcasts/sender', () => ({ runBroadcast: jest.fn() }));

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
  beforeEach(() => jest.clearAllMocks());

  it('401 when unauthenticated', async () => {
    (getSession as jest.Mock).mockResolvedValueOnce(null);
    const res = await POST(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(401);
  });

  it('403 when not owner', async () => {
    (getSession as jest.Mock).mockResolvedValueOnce({ user: { id: 'u2', email: 'x@x.com' } });
    (queryOne as jest.Mock).mockResolvedValueOnce({ id: 'c1', name: 'Salsa', created_by: 'u1' });
    const res = await POST(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(403);
  });

  it('402 when quota exhausted', async () => {
    (getSession as jest.Mock).mockResolvedValueOnce({ user: { id: 'u1', email: 'o@o.com' } });
    (queryOne as jest.Mock).mockResolvedValueOnce({ id: 'c1', name: 'Salsa', created_by: 'u1' });
    (checkCanSend as jest.Mock).mockResolvedValueOnce({
      allowed: false,
      reason: 'quota_exhausted',
      quota: { tier: 'free', used: 10, limit: 10 },
    });
    const res = await POST(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(402);
  });

  it('422 when no recipients', async () => {
    (getSession as jest.Mock).mockResolvedValueOnce({ user: { id: 'u1', email: 'o@o.com' } });
    (queryOne as jest.Mock)
      .mockResolvedValueOnce({ id: 'c1', name: 'Salsa', created_by: 'u1' })
      .mockResolvedValueOnce({ id: 'b-new' });
    (checkCanSend as jest.Mock).mockResolvedValueOnce({ allowed: true });
    (getActiveRecipientsForCommunity as jest.Mock).mockResolvedValueOnce([]);
    const res = await POST(makeReq(), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(422);
  });

  it('200 happy path — inserts, sends, updates status', async () => {
    (getSession as jest.Mock).mockResolvedValueOnce({ user: { id: 'u1', email: 'o@o.com' } });
    (queryOne as jest.Mock)
      .mockResolvedValueOnce({ id: 'c1', name: 'Salsa', created_by: 'u1' })
      .mockResolvedValueOnce({ id: 'b-new' });
    (checkCanSend as jest.Mock).mockResolvedValueOnce({ allowed: true });
    (getActiveRecipientsForCommunity as jest.Mock).mockResolvedValueOnce([
      { userId: 'u2', email: 'a@a.com', displayName: 'A', unsubscribeToken: 't' },
    ]);
    (runBroadcast as jest.Mock).mockResolvedValueOnce({
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
    expect(runBroadcast).toHaveBeenCalledTimes(1);
  });
});

describe('GET broadcasts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401 when unauthenticated', async () => {
    (getSession as jest.Mock).mockResolvedValueOnce(null);
    const res = await GET(new Request('http://localhost/x'), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(401);
  });

  it('returns list of broadcasts for owner', async () => {
    (getSession as jest.Mock).mockResolvedValueOnce({ user: { id: 'u1' } });
    (queryOne as jest.Mock).mockResolvedValueOnce({ id: 'c1', name: 'Salsa', created_by: 'u1' });
    (query as jest.Mock).mockResolvedValueOnce([
      { id: 'b1', subject: 'S', recipient_count: 5, status: 'sent', sent_at: null, created_at: 'now' },
    ]);
    const res = await GET(new Request('http://localhost/x'), { params: { communitySlug: 'salsa' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.broadcasts).toHaveLength(1);
  });
});
