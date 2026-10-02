/**
 * Course slugs are unique per community: create de-duplicates like edit
 * does (-2, -3, ...), and a title with no Latin letters or digits gets a short
 * id instead of an empty slug. Every course route resolves the course by slug,
 * so a duplicate could make a delete hit the wrong course.
 */
import { POST as createCourse } from '@/app/api/community/[communitySlug]/courses/route';
import { PUT as updateCourse } from '@/app/api/community/[communitySlug]/courses/[courseSlug]/route';

const mockSql = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: (...a: unknown[]) => mockSql(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  query: jest.fn(),
}));

const community = { id: 'c1', slug: 'salsa', created_by: 'owner' };
jest.mock('@/lib/community-auth', () => ({
  requireCommunityManager: jest.fn(async () => ({ ok: true, community, session: { user: { id: 'owner' } } })),
  requireCommunityViewer: jest.fn(),
  userCanManageCommunity: jest.fn(),
}));
jest.mock('@/lib/mux', () => ({ deleteMuxAsset: jest.fn() }));
jest.mock('@/lib/mux-asset-usage', () => ({ isMuxAssetUsedElsewhere: jest.fn() }));
jest.mock('@/lib/storage', () => ({
  deleteFile: jest.fn(),
  uploadFile: jest.fn(),
  generateFileKey: jest.fn(),
  extractKeyFromUrl: jest.fn(),
}));

const text = (call: unknown[]) => (call[0] as string[]).join('?');
let takenSlugs: string[];
let insertError: unknown;

/** The value written to `slug` by the INSERT (the 4th value) or UPDATE. */
const insertedSlugs = () =>
  mockQueryOne.mock.calls.filter((c) => /INSERT INTO courses/.test(text(c))).map((c) => c[4]);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  takenSlugs = [];
  insertError = null;
  mockSql.mockResolvedValue([]);
  mockQueryOne.mockImplementation(async (strings: string[], ...values: unknown[]) => {
    const q = strings.join('?');
    if (/INSERT INTO courses/.test(q)) {
      if (insertError) {
        const e = insertError;
        insertError = null;
        throw e;
      }
      return { id: 'new', slug: values[3] };
    }
    if (/FROM courses/.test(q) && /slug = /.test(q) && /id (IS DISTINCT FROM|!=)/.test(q)) {
      return takenSlugs.includes(values[1] as string) ? { id: 'other' } : null;
    }
    if (/FROM courses/.test(q)) return { id: 'course-1', title: 'Old', slug: 'old', image_url: null };
    return null;
  });
});

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const post = (title: string) =>
  createCourse(new Request('http://x', { method: 'POST', body: form({ title, description: 'd' }) }), {
    params: Promise.resolve({ communitySlug: 'salsa' }),
  });

describe('POST /courses', () => {
  it('suffixes a slug that another course in the community already uses', async () => {
    takenSlugs = ['salsa-level-1', 'salsa-level-1-2'];
    const res = await post('Salsa: Level 1');
    expect(res.status).toBe(200);
    expect(insertedSlugs()).toEqual(['salsa-level-1-3']);
    expect((await res.json()).slug).toBe('salsa-level-1-3');
  });

  it('falls back to a short id when the title gives an empty slug', async () => {
    const res = await post('舞蹈课');
    expect(res.status).toBe(200);
    expect(insertedSlugs()[0]).toMatch(/^course-[a-z0-9]{8}$/);
  });

  it('trims hyphens left by leading or trailing punctuation', async () => {
    await post(' - Bachata - ');
    expect(insertedSlugs()).toEqual(['bachata']);
  });

  it('tries the next slug when a concurrent create took it first', async () => {
    insertError = Object.assign(new Error('duplicate key'), { code: '23505' });
    const res = await post('Salsa');
    expect(res.status).toBe(200);
    expect(insertedSlugs()).toHaveLength(2);
  });
});

describe('PUT /courses/[courseSlug]', () => {
  it('falls back to a short id when the new title gives an empty slug', async () => {
    const res = await updateCourse(
      new Request('http://x', { method: 'PUT', body: form({ title: '舞蹈课', description: 'd', is_public: 'false' }) }),
      { params: Promise.resolve({ communitySlug: 'salsa', courseSlug: 'old' }) }
    );
    expect(res.status).toBe(200);
    const update = mockSql.mock.calls.find((c) => /UPDATE courses/.test(text(c)))!;
    const strings = update[0] as string[];
    const slug = update[strings.findIndex((s) => /\bslug = $/.test(s)) + 1];
    expect(slug).toMatch(/^course-[a-z0-9]{8}$/);
  });
});
