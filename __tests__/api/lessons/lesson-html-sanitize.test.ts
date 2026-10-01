/**
 * Lesson text is rich-text HTML that the classroom page renders with
 * dangerouslySetInnerHTML. It is sanitized when an owner saves it, and again
 * whenever lessons are returned, for rows stored before that.
 */
import { PUT as lessonPUT } from '@/app/api/community/[communitySlug]/courses/[courseSlug]/chapters/[chapterId]/lessons/[lessonId]/route';
import { PUT as reorderPUT } from '@/app/api/community/[communitySlug]/courses/[courseSlug]/chapters/[chapterId]/lessons/reorder/route';
import { GET as courseGET } from '@/app/api/community/[communitySlug]/courses/[courseSlug]/route';

const mockSql = jest.fn();
const mockQueryOne = jest.fn();
const mockQuery = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: (...a: unknown[]) => mockSql(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  query: (...a: unknown[]) => mockQuery(...a),
}));

const community = { id: 'c1', slug: 'salsa', created_by: 'owner' };
jest.mock('@/lib/community-auth', () => ({
  requireCommunityManager: jest.fn(async () => ({ ok: true, community, session: { user: { id: 'owner' } } })),
  requireCommunityViewer: jest.fn(async () => ({ ok: true, community, session: { user: { id: 'm1' } } })),
  userCanManageCommunity: jest.fn().mockResolvedValue(false),
}));
jest.mock('@/lib/mux', () => ({ deleteMuxAsset: jest.fn(), Video: { assets: { retrieve: jest.fn() } } }));
jest.mock('@/lib/mux-asset-usage', () => ({ isMuxAssetUsedElsewhere: jest.fn() }));
jest.mock('@/lib/storage', () => ({
  deleteFile: jest.fn(),
  uploadFile: jest.fn(),
  generateFileKey: jest.fn(),
  extractKeyFromUrl: jest.fn(),
}));

const PAYLOAD = '<h2>Step 1</h2><p>Hold<img src=x onerror="fetch(\'/api/admin/users\')"></p><script>alert(1)</script>';
const CLEAN = '<h2>Step 1</h2><p>Hold</p>';

const lessonParams = Promise.resolve({
  communitySlug: 'salsa',
  courseSlug: 'basics',
  chapterId: 'ch1',
  lessonId: 'l1',
});

const put = (body: unknown) =>
  new Request('http://localhost/x', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const sqlText = (call: unknown[]) => (call[0] as string[]).join('?');

const storedLesson = {
  id: 'l1',
  title: 'Basics',
  content: PAYLOAD,
  video_asset_id: null,
  playback_id: null,
  chapter_id: 'ch1',
  lesson_position: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PUT lesson', () => {
  beforeEach(() => {
    mockQueryOne.mockImplementation((strings: string[], ...values: unknown[]) => {
      const text = strings.join('?');
      if (text.includes('UPDATE lessons')) {
        // RETURNING *: content is whatever was written (2nd value), or the
        // stored value when the update leaves it alone (COALESCE with null).
        return Promise.resolve({ ...storedLesson, content: values[1] ?? storedLesson.content });
      }
      return Promise.resolve({ id: 'l1', chapter_id: 'ch1', video_asset_id: null, playback_id: null });
    });
  });

  it('stores sanitized content', async () => {
    const res = await lessonPUT(put({ content: PAYLOAD }), { params: lessonParams });
    expect(res.status).toBe(200);
    const update = mockQueryOne.mock.calls.find((c) => sqlText(c).includes('UPDATE lessons'))!;
    expect(update[2]).toBe(CLEAN);
    expect((await res.json()).content).toBe(CLEAN);
  });

  it('keeps an empty lesson text empty', async () => {
    await lessonPUT(put({ content: '' }), { params: lessonParams });
    const update = mockQueryOne.mock.calls.find((c) => sqlText(c).includes('UPDATE lessons'))!;
    expect(update[2]).toBe('');
  });

  it('leaves content alone when only the title changes, and returns it sanitized', async () => {
    const res = await lessonPUT(put({ title: 'New title' }), { params: lessonParams });
    const update = mockQueryOne.mock.calls.find((c) => sqlText(c).includes('UPDATE lessons'))!;
    expect(update[2]).toBeNull();
    expect((await res.json()).content).toBe(CLEAN);
  });

  it('rejects content that is not a string', async () => {
    const res = await lessonPUT(put({ content: { html: PAYLOAD } }), { params: lessonParams });
    expect(res.status).toBe(400);
    expect(mockQueryOne.mock.calls.some((c) => sqlText(c).includes('UPDATE lessons'))).toBe(false);
  });
});

describe('lesson reads', () => {
  it('the course route returns sanitized lesson content', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'co1', slug: 'basics', is_public: true });
    mockQuery
      .mockResolvedValueOnce([{ id: 'ch1', title: 'Ch', chapter_position: 0, course_id: 'co1' }])
      .mockResolvedValueOnce([storedLesson, { ...storedLesson, id: 'l2', content: null }])
      .mockResolvedValueOnce([]);
    const res = await courseGET(new Request('http://localhost/x'), {
      params: Promise.resolve({ communitySlug: 'salsa', courseSlug: 'basics' }),
    });
    expect(res.status).toBe(200);
    const [l1, l2] = (await res.json()).chapters[0].lessons;
    expect(l1.content).toBe(CLEAN);
    expect(l2.content).toBeNull();
  });

  it('the reorder route returns sanitized lesson content', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'ch1' });
    mockSql.mockResolvedValue([]);
    mockQuery.mockResolvedValueOnce([storedLesson]);
    const res = await reorderPUT(put({ lessons: [{ id: 'l1' }] }), {
      params: Promise.resolve({ communitySlug: 'salsa', courseSlug: 'basics', chapterId: 'ch1' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json())[0].content).toBe(CLEAN);
  });
});
