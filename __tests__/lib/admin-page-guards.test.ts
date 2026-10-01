/**
 * Page guards in lib/community-auth.ts, and a check that every admin page
 * calls one before loading data.
 *
 * In the App Router a layout and its page render at the same time, so a
 * redirect() in an admin layout does not stop the page from running its
 * queries and sending the result. Each admin page has to guard itself.
 *
 * @jest-environment node
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

jest.mock('@/lib/db', () => ({ queryOne: jest.fn(), query: jest.fn() }));
jest.mock('@/lib/auth-session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/community-data', () => ({
  getMembershipStatus: jest.fn(),
  getUserIsAdmin: jest.fn(),
}));
jest.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

import { queryOne } from '@/lib/db';
import { getSession } from '@/lib/auth-session';
import { getUserIsAdmin } from '@/lib/community-data';
import { requireCommunityManagerPage, requirePlatformAdminPage } from '@/lib/community-auth';

const mockQueryOne = queryOne as jest.Mock;
const mockSession = getSession as jest.Mock;
const mockIsAdmin = getUserIsAdmin as jest.Mock;

const community = { id: 'c1', slug: 'salsa', name: 'Salsa', created_by: 'owner', stripe_account_id: 'acct_1' };

beforeEach(() => {
  jest.resetAllMocks();
  mockIsAdmin.mockResolvedValue(false);
});

describe('requirePlatformAdminPage', () => {
  it('sends a signed-out visitor to log in', async () => {
    mockSession.mockResolvedValue(null);
    await expect(requirePlatformAdminPage()).rejects.toThrow('REDIRECT /auth/login');
  });

  it('sends a signed-in non-admin home', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1', isAdmin: false } });
    await expect(requirePlatformAdminPage()).rejects.toThrow('REDIRECT /');
  });

  it('lets an admin through (same flag as the admin layout)', async () => {
    const session = { user: { id: 'a1', isAdmin: true } };
    mockSession.mockResolvedValue(session);
    await expect(requirePlatformAdminPage()).resolves.toBe(session);
  });
});

describe('requireCommunityManagerPage', () => {
  it('sends a signed-out visitor to log in', async () => {
    mockSession.mockResolvedValue(null);
    await expect(requireCommunityManagerPage('salsa')).rejects.toThrow('REDIRECT /auth/login');
    expect(mockQueryOne).not.toHaveBeenCalled();
  });

  it('sends a member who does not manage the community to its feed', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1' } });
    mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce({ created_by: 'owner' });
    await expect(requireCommunityManagerPage('salsa')).rejects.toThrow('REDIRECT /salsa');
  });

  it('sends a visitor of an unknown community to that slug', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1' } });
    mockQueryOne.mockResolvedValueOnce(undefined);
    await expect(requireCommunityManagerPage('nope')).rejects.toThrow('REDIRECT /nope');
  });

  it('lets the owner through with the community', async () => {
    const session = { user: { id: 'owner' } };
    mockSession.mockResolvedValue(session);
    mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce({ created_by: 'owner' });
    await expect(requireCommunityManagerPage('salsa')).resolves.toEqual({ session, community });
  });

  it('lets a platform admin through', async () => {
    mockSession.mockResolvedValue({ user: { id: 'a1' } });
    mockQueryOne.mockResolvedValueOnce(community).mockResolvedValueOnce({ created_by: 'owner' });
    mockIsAdmin.mockResolvedValue(true);
    await expect(requireCommunityManagerPage('salsa')).resolves.toMatchObject({ community });
  });
});

describe('every admin page guards itself before loading data', () => {
  const root = join(__dirname, '..', '..');
  const pagesUnder = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return pagesUnder(path);
      return name === 'page.tsx' ? [path] : [];
    });

  const pages = [
    ...pagesUnder(join(root, 'app/admin')).map((file) => ({ file, guard: 'requirePlatformAdminPage' })),
    ...pagesUnder(join(root, 'app/[communitySlug]/admin')).map((file) => ({ file, guard: 'requireCommunityManagerPage' })),
  ];

  it('finds the admin pages', () => {
    expect(pages.length).toBeGreaterThanOrEqual(15);
  });

  it.each(pages.map((p) => [relative(root, p.file), p.guard]))('%s calls %s first', (file, guard) => {
    const source = readFileSync(join(root, file), 'utf8');
    const body = source.slice(source.indexOf('export default'));
    const guardAt = body.indexOf(`await ${guard}(`);
    expect(guardAt).toBeGreaterThan(-1);
    // Only reading the route params may come before the guard.
    const earlierAwaits = body.slice(0, guardAt).match(/await (?!props\.params\b)/g) ?? [];
    expect(earlierAwaits).toEqual([]);
  });
});
