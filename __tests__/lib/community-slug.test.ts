/**
 * @jest-environment node
 */
import { checkCommunitySlug, normalizeCommunitySlug } from '@/lib/community-slug';

describe('normalizeCommunitySlug', () => {
  it.each([
    ['Salsa Paris', 'salsa-paris'],
    ['Salsa-Paris', 'salsa-paris'],
    ['  --Salsa: Level 1!-- ', 'salsa-level-1'],
    ['../../admin', 'admin'],
    ['a/b?c#d', 'a-b-c-d'],
    ['Café Bachata', 'caf-bachata'],
    ['舞蹈', ''],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeCommunitySlug(input)).toBe(expected);
  });
});

describe('checkCommunitySlug', () => {
  it('accepts and normalises an ordinary slug', () => {
    expect(checkCommunitySlug('Salsa-Paris')).toEqual({ ok: true, slug: 'salsa-paris' });
  });

  it.each(['Dashboard', 'discovery', 'ADMIN', 'api', 'live-class', 'Terms'])(
    'refuses the reserved slug %j',
    (input) => {
      const result = checkCommunitySlug(input);
      expect(result.ok).toBe(false);
    }
  );

  it.each(['', '   ', '!!!', '舞蹈', undefined, null, 42])('refuses %j, which gives no slug', (input) => {
    expect(checkCommunitySlug(input).ok).toBe(false);
  });
});
