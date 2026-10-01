/**
 * Post-login redirects come from the URL (?redirect=) and localStorage, so
 * they only accept same-origin relative paths. Anything else would let a
 * crafted link send someone to another site right after a real sign-in.
 */
import { authModalRequestFromSearch, communityPath, loginPath, safeRedirectPath } from '@/lib/safe-redirect';

describe('safeRedirectPath', () => {
  it.each(['/dashboard', '/salsa/admin?tab=members#top', '/', '/%2F%2Fevil.example'])(
    'accepts the same-origin path %s',
    (path) => {
      expect(safeRedirectPath(path)).toBe(path);
    }
  );

  it.each([
    'https://evil.example/login',
    'http://evil.example',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    'javascript:alert(1)',
    'evil.example',
    ' /dashboard',
    '',
  ])('rejects %j', (value) => {
    expect(safeRedirectPath(value)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(safeRedirectPath(null)).toBeNull();
    expect(safeRedirectPath(undefined)).toBeNull();
    expect(safeRedirectPath(['/dashboard'])).toBeNull();
  });
});

describe('loginPath', () => {
  it('opens the login modal on the home page and comes back afterwards', () => {
    expect(loginPath('/salsa/admin')).toBe('/?auth=login&redirect=%2Fsalsa%2Fadmin');
  });

  it('drops a return path that is not same-origin', () => {
    expect(loginPath('https://evil.example')).toBe('/?auth=login');
    expect(loginPath()).toBe('/?auth=login');
  });
});

describe('authModalRequestFromSearch', () => {
  it('opens sign-up with the default onboarding redirect', () => {
    expect(authModalRequestFromSearch('?auth=signup')).toEqual({ tab: 'signup', redirect: '/onboarding' });
  });

  it('opens login with a safe redirect', () => {
    expect(authModalRequestFromSearch('?auth=login&redirect=%2Fadmin')).toEqual({
      tab: 'signin',
      redirect: '/admin',
    });
  });

  it('ignores an unsafe redirect', () => {
    expect(authModalRequestFromSearch('?auth=signup&redirect=https://evil.example')).toEqual({
      tab: 'signup',
      redirect: '/onboarding',
    });
    expect(authModalRequestFromSearch('?auth=login&redirect=//evil.example')).toEqual({
      tab: 'signin',
      redirect: undefined,
    });
  });

  it('does nothing without a known auth param', () => {
    expect(authModalRequestFromSearch('')).toBeNull();
    expect(authModalRequestFromSearch('?auth=admin')).toBeNull();
  });
});

describe('communityPath', () => {
  it('builds paths for normal slugs unchanged', () => {
    expect(communityPath('salsa')).toBe('/salsa');
    expect(communityPath('salsa-tallinn', '/admin/emails/b1')).toBe('/salsa-tallinn/admin/emails/b1');
  });

  it('keeps a decoded route param inside our origin', () => {
    // Next decodes params, so /%2F%2Fevil.example/admin arrives as "//evil.example".
    expect(communityPath('//evil.example')).toBe('/%2F%2Fevil.example');
    expect(communityPath('\\evil.example', '/about')).toBe('/%5Cevil.example/about');
    for (const slug of ['//evil.example', '/evil.example', '\\evil.example', 'a/../../evil']) {
      expect(safeRedirectPath(communityPath(slug, '/about'))).not.toBeNull();
    }
  });
});
