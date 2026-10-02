/**
 * The lesson editor's create (POST) and update (PUT) routes: an explicit
 * member_price of null removes the member price while an absent one keeps it,
 * requirements, the monthly booking limit and the location are saved, and the
 * member price must stay between 0 and the regular price.
 */
import { POST } from '@/app/api/community/[communitySlug]/private-lessons/route';
import { PUT } from '@/app/api/community/[communitySlug]/private-lessons/[lessonId]/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));
jest.mock('@/lib/community-auth', () => ({ userCanManageCommunity: jest.fn() }));

const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: jest.fn(),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  query: jest.fn(),
}));

const community = { id: 'c1', created_by: 'teacher-1' };
const currentLesson = {
  id: 'lesson-1',
  regular_price: '50.00',
  member_price: '40.00',
  max_bookings_per_month: 10,
  requirements: 'Bring shoes',
};
let savedLesson: Record<string, unknown> = currentLesson;

type Call = { text: string; strings: string[]; values: unknown[] };
const calls = (): Call[] =>
  mockQueryOne.mock.calls.map(([strings, ...values]) => ({
    text: (strings as string[]).join('?'),
    strings: strings as string[],
    values,
  }));
const writeCall = (re: RegExp) => calls().find((c) => re.test(c.text));
/** The value interpolated right after the SQL fragment matching `re`. */
function valueAfter(call: Call, re: RegExp): unknown {
  const i = call.strings.findIndex((s) => re.test(s));
  if (i < 0) throw new Error(`fragment ${re} not found in: ${call.text}`);
  return call.values[i];
}

beforeEach(() => {
  jest.clearAllMocks();
  savedLesson = currentLesson;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockGetSession.mockResolvedValue({ user: { id: 'teacher-1' } });
  mockQueryOne.mockImplementation((strings: string[]) => {
    const text = strings.join('?');
    if (/FROM communities/.test(text)) return Promise.resolve(community);
    if (/^\s*SELECT[\s\S]*FROM private_lessons/.test(text)) return Promise.resolve(savedLesson);
    if (/UPDATE private_lessons|INSERT INTO private_lessons/.test(text)) {
      return Promise.resolve({ id: 'lesson-1' });
    }
    return Promise.resolve(null);
  });
});

function put(body: Record<string, unknown>) {
  return PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify(body) }), {
    params: Promise.resolve({ communitySlug: 'salsa', lessonId: 'lesson-1' }),
  });
}

function create(body: Record<string, unknown>) {
  return POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }), {
    params: Promise.resolve({ communitySlug: 'salsa' }),
  });
}

describe('PUT /private-lessons/[lessonId]', () => {
  it('removes the member price when member_price is null', async () => {
    const res = await put({ title: 'Bachata', member_price: null });

    expect(res.status).toBe(200);
    const update = writeCall(/UPDATE private_lessons/)!;
    expect(update.text).not.toMatch(/member_price = COALESCE/);
    expect(valueAfter(update, /member_price = $/)).toBeNull();
  });

  it('keeps the member price when member_price is absent', async () => {
    await put({ title: 'Bachata' });

    const update = writeCall(/UPDATE private_lessons/)!;
    expect(valueAfter(update, /member_price = $/)).toBe(40);
  });

  it('saves requirements, the monthly limit and the location', async () => {
    await put({ requirements: 'Comfortable shoes', max_bookings_per_month: 5, location_type: 'in_person' });

    const update = writeCall(/UPDATE private_lessons/)!;
    expect(valueAfter(update, /requirements = $/)).toBe('Comfortable shoes');
    expect(valueAfter(update, /max_bookings_per_month = $/)).toBe(5);
    expect(update.text).toMatch(/location_type = COALESCE/);
    expect(update.values).toContain('in_person');
  });

  it('clears requirements and the monthly limit when sent empty', async () => {
    await put({ requirements: '  ', max_bookings_per_month: null });

    const update = writeCall(/UPDATE private_lessons/)!;
    expect(valueAfter(update, /requirements = $/)).toBeNull();
    expect(valueAfter(update, /max_bookings_per_month = $/)).toBeNull();
  });

  it.each([
    ['a negative member price', { member_price: -5 }],
    ['a member price above the saved regular price', { member_price: 60 }],
    ['a member price above the new regular price', { regular_price: 30, member_price: 35 }],
    ['a regular price below the saved member price', { regular_price: 30 }],
    ['a regular price of 0', { regular_price: 0 }],
    ['a regular price under the 0.50 minimum', { regular_price: 0.4 }],
    ['a member price between 0 and 0.50', { member_price: 0.3 }],
    ['a monthly limit that is not a positive whole number', { max_bookings_per_month: 0 }],
    ['an unknown location', { location_type: 'moon' }],
  ])('refuses %s', async (_label, body) => {
    const res = await put(body);

    expect(res.status).toBe(400);
    expect(writeCall(/UPDATE private_lessons/)).toBeUndefined();
  });

  it('accepts a member price equal to the regular price or 0', async () => {
    expect((await put({ member_price: 50 })).status).toBe(200);
    expect((await put({ member_price: 0 })).status).toBe(200);
  });

  describe('a legacy lesson saved with prices the editor no longer accepts', () => {
    beforeEach(() => {
      savedLesson = { ...currentLesson, regular_price: '0.00', member_price: null };
    });

    it('can still have its title edited', async () => {
      expect((await put({ title: 'Renamed' })).status).toBe(200);
    });

    it('can be saved from the editor with its prices unchanged', async () => {
      expect((await put({ title: 'Renamed', regular_price: 0, member_price: null })).status).toBe(200);
    });

    it('validates the resulting pair when a price changes', async () => {
      expect((await put({ member_price: 10 })).status).toBe(400);
      expect((await put({ regular_price: 40 })).status).toBe(200);
    });
  });
});

describe('POST /private-lessons', () => {
  const lesson = {
    title: 'Bachata',
    description: 'Basics',
    duration_minutes: 60,
    regular_price: 50,
    member_price: null,
    location_type: 'both',
    max_bookings_per_month: 8,
    requirements: 'Shoes',
  };

  it('saves requirements, the monthly limit and the location', async () => {
    const res = await create(lesson);

    expect(res.status).toBe(201);
    const insert = writeCall(/INSERT INTO private_lessons/)!;
    expect(insert.text).toMatch(/location_type/);
    expect(insert.text).toMatch(/max_bookings_per_month/);
    expect(insert.text).toMatch(/requirements/);
    expect(insert.values).toEqual(expect.arrayContaining(['both', 8, 'Shoes']));
  });

  it.each([
    ['a negative member price', { member_price: -1 }],
    ['a member price above the regular price', { member_price: 51 }],
    ['a regular price under the 0.50 minimum', { regular_price: 0.3 }],
    ['a member price between 0 and 0.50', { member_price: 0.2 }],
    ['an unknown location', { location_type: 'moon' }],
  ])('refuses %s', async (_label, body) => {
    const res = await create({ ...lesson, ...body });

    expect(res.status).toBe(400);
    expect(writeCall(/INSERT INTO private_lessons/)).toBeUndefined();
  });
});
