/**
 * Thread bodies are HTML from the rich-text editor, but the API accepts any
 * string. Create and edit must store a sanitized body, so a member cannot
 * plant script that runs when the owner or an admin opens the feed.
 */
import { POST as createPOST } from '@/app/api/threads/create/route';
import { PATCH as threadPATCH } from '@/app/api/threads/[threadId]/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));

const mockSql = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: (...a: unknown[]) => mockSql(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  query: jest.fn(),
}));

jest.mock('@/lib/community-auth', () => ({
  canViewCommunity: jest.fn().mockResolvedValue(true),
}));

const SESSION = { user: { id: 'u1', email: 'u1@x.com' } };
const PAYLOAD = '<p>Hi</p><img src="x" onerror="fetch(\'/api/admin/users\')"><script>alert(1)</script>';

function sqlText(call: unknown[]): string {
  return (call[0] as string[]).join('?');
}

function json(body: unknown) {
  return new Request('http://localhost/api/threads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(SESSION);
});

describe('POST /api/threads/create', () => {
  beforeEach(() => {
    mockQueryOne.mockImplementation((strings: string[], ...values: unknown[]) => {
      const text = strings.join('?');
      if (text.includes('FROM communities')) {
        return Promise.resolve({
          created_by: 'owner',
          thread_categories: [{ id: 'cat1', name: 'General' }],
        });
      }
      if (text.includes('FROM profiles')) {
        return Promise.resolve({ full_name: 'U One', display_name: null, avatar_url: null });
      }
      if (text.includes('INSERT INTO threads')) {
        // RETURNING * echoes what was stored: content is the 2nd value.
        return Promise.resolve({
          id: 't1',
          title: values[0],
          content: values[1],
          user_id: 'u1',
          created_at: '2026-10-01T00:00:00Z',
          author_name: 'U One',
          author_image: null,
        });
      }
      return Promise.resolve(null);
    });
  });

  it('stores and returns a sanitized body', async () => {
    const res = await createPOST(
      json({ title: 'T', content: PAYLOAD, communityId: 'c1', categoryId: 'cat1' })
    );
    expect(res.status).toBe(200);

    const insert = mockQueryOne.mock.calls.find((c) => sqlText(c).includes('INSERT INTO threads'))!;
    expect(insert[2]).toBe('<p>Hi</p>');
    const body = await res.json();
    expect(body.content).toBe('<p>Hi</p>');
  });

  it('rejects a body that is nothing but stripped markup', async () => {
    const res = await createPOST(
      json({ title: 'T', content: '<script>alert(1)</script>', communityId: 'c1', categoryId: 'cat1' })
    );
    expect(res.status).toBe(400);
    expect(mockQueryOne.mock.calls.some((c) => sqlText(c).includes('INSERT INTO threads'))).toBe(false);
  });

  it('rejects a body that is not a string', async () => {
    const res = await createPOST(
      json({ title: 'T', content: { html: '<p>x</p>' }, communityId: 'c1', categoryId: 'cat1' })
    );
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/threads/[threadId]', () => {
  const params = Promise.resolve({ threadId: 't1' });

  beforeEach(() => {
    mockQueryOne.mockResolvedValue({ user_id: 'u1', community_created_by: 'owner' });
    mockSql.mockResolvedValue([]);
  });

  it('stores a sanitized body', async () => {
    const res = await threadPATCH(json({ title: 'T', content: PAYLOAD }), { params });
    expect(res.status).toBe(200);

    const update = mockSql.mock.calls.find((c) => sqlText(c).includes('UPDATE threads'))!;
    expect(update.slice(1)).toContain('<p>Hi</p>');
    expect(update.slice(1).some((v: unknown) => typeof v === 'string' && v.includes('onerror'))).toBe(false);
  });

  it('rejects an edit whose body is not a string', async () => {
    const res = await threadPATCH(json({ title: 'T', content: 42 }), { params });
    expect(res.status).toBe(400);
    expect(mockSql).not.toHaveBeenCalled();
  });
});
