// Redirect targets that arrive from outside (?redirect=, localStorage) are
// only followed when they are same-origin relative paths. Used by the auth
// modal, the email verification pages and the login links of page guards.

const BASE = 'https://dance-hub.invalid';

/** The path itself when it is a same-origin relative path, otherwise null. */
export function safeRedirectPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  // Browsers treat "\" like "/" and drop tabs and newlines in URLs, so
  // "/\evil.com" or "/<tab>/evil.com" would turn into "//evil.com".
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    if (new URL(value, BASE).origin !== BASE) return null;
  } catch {
    return null;
  }
  return value;
}

/** Home page with the login modal open, returning to returnTo afterwards. */
export function loginPath(returnTo?: string): string {
  const safe = safeRedirectPath(returnTo);
  return safe ? `/?auth=login&redirect=${encodeURIComponent(safe)}` : '/?auth=login';
}

export interface AuthModalRequest {
  tab: 'signin' | 'signup';
  redirect: string | undefined;
}

/**
 * Reads ?auth=login|signup and ?redirect= from the home page URL. Sign-up
 * defaults to onboarding; login without a redirect stays on the page.
 */
export function authModalRequestFromSearch(search: string): AuthModalRequest | null {
  const params = new URLSearchParams(search);
  const auth = params.get('auth');
  const redirect = safeRedirectPath(params.get('redirect')) ?? undefined;
  if (auth === 'signup') return { tab: 'signup', redirect: redirect ?? '/onboarding' };
  if (auth === 'login') return { tab: 'signin', redirect };
  return null;
}
