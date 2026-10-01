/**
 * Signed-out visitors of the admin areas go to the login modal on the home
 * page (there is no /auth/login page), and come back to the area afterwards.
 *
 * @jest-environment node
 */
jest.mock('@/lib/auth-session', () => ({ getSession: jest.fn().mockResolvedValue(null) }));
jest.mock('@/lib/community-data', () => ({
  getCommunityBySlug: jest.fn(),
  getUserIsAdmin: jest.fn(),
}));
jest.mock('@/app/admin/AdminLayoutClient', () => ({ __esModule: true, default: () => null }));
jest.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import PlatformAdminLayout from '@/app/admin/layout';
import CommunityAdminLayout from '@/app/[communitySlug]/admin/layout';
import { getCommunityBySlug } from '@/lib/community-data';

it('platform admin layout sends a signed-out visitor to log in, then back to /admin', async () => {
  await expect(PlatformAdminLayout({ children: null })).rejects.toThrow(
    'REDIRECT /?auth=login&redirect=%2Fadmin'
  );
});

it('community admin layout sends a signed-out visitor to log in, then back to the admin area', async () => {
  await expect(
    CommunityAdminLayout({ children: null, params: Promise.resolve({ communitySlug: 'salsa' }) })
  ).rejects.toThrow('REDIRECT /?auth=login&redirect=%2Fsalsa%2Fadmin');
  expect(getCommunityBySlug).not.toHaveBeenCalled();
});
