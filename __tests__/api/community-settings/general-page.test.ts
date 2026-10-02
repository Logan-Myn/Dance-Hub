/**
 * The General settings page only tells the form to lock status and opening
 * date while the community is still in pre-registration.
 */
import type { ReactElement } from 'react';
import GeneralSettingsPage from '@/app/[communitySlug]/admin/(with-nav)/general/page';

jest.mock('@/lib/community-auth', () => ({ requireCommunityManagerPage: jest.fn().mockResolvedValue({}) }));
jest.mock('@/components/admin/GeneralSettingsForm', () => ({ GeneralSettingsForm: () => null }));

const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({ queryOne: (...a: unknown[]) => mockQueryOne(...a) }));

const row = {
  id: 'c1', name: 'Salsa', description: null, image_url: null, image_focal_x: 50, image_focal_y: 50,
  image_zoom: 1, custom_links: [], slug: 'salsa', opening_date: null, can_change_opening_date: true,
};

/** Props the page passes to GeneralSettingsForm. */
async function formProps(status: string, preRegistered: number) {
  mockQueryOne.mockImplementation(async (strings: string[]) =>
    /FROM community_members/.test(strings.join('?')) ? { count: preRegistered } : { ...row, status }
  );
  const page = (await GeneralSettingsPage({ params: Promise.resolve({ communitySlug: 'salsa' }) })) as ReactElement<{
    children: ReactElement<Record<string, unknown>>[];
  }>;
  return page.props.children[1].props;
}

beforeEach(() => mockQueryOne.mockReset());

it('locks the fields while pre-registered members wait for the opening', async () => {
  expect((await formProps('pre_registration', 2)).hasPreRegistrations).toBe(true);
});

it('does not lock an open community whose members still wait for a first charge', async () => {
  expect((await formProps('active', 2)).hasPreRegistrations).toBe(false);
  expect(mockQueryOne.mock.calls.some((c) => /FROM community_members/.test((c[0] as string[]).join('?')))).toBe(false);
});
