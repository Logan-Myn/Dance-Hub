/**
 * syncProfileEmail (better-auth user.update hook, wired in lib/auth-server.ts)
 * keeps profiles.email and email_preferences.email in step with the auth
 * user's email after a change. Broadcast recipients, welcome and booking
 * emails and the owner's member list all read profiles.email.
 *
 * @jest-environment node
 */
const mockSql = jest.fn();
jest.mock('@/lib/db', () => ({ sql: (...a: unknown[]) => mockSql(...a) }));

import { syncProfileEmail } from '@/lib/auth-hooks';

describe('syncProfileEmail', () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockSql.mockResolvedValue([]);
  });

  const texts = () => mockSql.mock.calls.map((c) => (c[0] as string[]).join('?'));

  it('copies the new email to profiles and email_preferences', async () => {
    await syncProfileEmail({ id: 'u1', email: 'new@x.com' });
    expect(texts()).toHaveLength(2);
    const [profiles, prefs] = mockSql.mock.calls;
    expect(texts()[0]).toContain('UPDATE profiles');
    expect(profiles.slice(1)).toEqual(expect.arrayContaining(['new@x.com', 'u1']));
    expect(texts()[1]).toContain('UPDATE email_preferences');
    expect(prefs.slice(1)).toEqual(expect.arrayContaining(['new@x.com', 'u1']));
  });

  it('skips updates without an email', async () => {
    await syncProfileEmail({ id: 'u1' });
    await syncProfileEmail(null);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('never throws, so a sync failure cannot break the auth request', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSql.mockRejectedValueOnce(new Error('duplicate key'));
    await expect(syncProfileEmail({ id: 'u1', email: 'new@x.com' })).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
