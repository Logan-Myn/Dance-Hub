// One slug rule for community create, the owner's settings update and the
// platform admin edit, so a stored slug is always a single safe path segment
// that doesn't shadow an app route. Pure: also imported by client components.

// Top-level paths the app (or public/) already serves. A community with one
// of these slugs would be unreachable, and its admin redirect would land on
// the app's own page.
export const RESERVED_COMMUNITY_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'auth',
  'community',
  'components',
  'dashboard',
  'discovery',
  'fonts',
  'images',
  'landing-alt',
  'live-class',
  'login',
  'onboarding',
  'pricing',
  'privacy',
  'register',
  'terms',
  'unsubscribe',
  'video-session',
]);

/** Lowercase a-z/0-9 words joined by single hyphens (same rule create always used). */
export function normalizeCommunitySlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export type CommunitySlugCheck = { ok: true; slug: string } | { ok: false; error: string };

export function checkCommunitySlug(input: unknown): CommunitySlugCheck {
  const slug = typeof input === 'string' ? normalizeCommunitySlug(input) : '';
  // A name made only of characters the rule strips (accents, emoji, a
  // non-Latin script) gives an empty slug, which would put the community at
  // the site root.
  if (!slug) {
    return { ok: false, error: 'Please use at least one letter or number in the community name' };
  }
  if (RESERVED_COMMUNITY_SLUGS.has(slug)) {
    return { ok: false, error: 'This name is reserved for a page of the site. Please choose a different name.' };
  }
  return { ok: true, slug };
}
