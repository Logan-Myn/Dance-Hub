/**
 * @jest-environment node
 */
import { readdirSync } from 'fs';
import { RESERVED_COMMUNITY_SLUGS, checkCommunitySlug, normalizeCommunitySlug } from '@/lib/community-slug';

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

  it.each(['Dashboard', 'discovery', 'ADMIN', 'api', 'live-class', 'Terms', 'Help'])(
    'refuses the reserved slug %j',
    (input) => {
      const result = checkCommunitySlug(input);
      expect(result.ok).toBe(false);
    }
  );

  it('reserves every top-level folder of app/ and public/, so no community shadows a page', () => {
    const folders = ['app', 'public'].flatMap((dir) =>
      readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith('[') && !e.name.startsWith('('))
        .map((e) => e.name)
    );
    expect(folders.filter((f) => !RESERVED_COMMUNITY_SLUGS.has(f))).toEqual([]);
  });

  it.each(['', '   ', '!!!', '舞蹈', undefined, null, 42])('refuses %j, which gives no slug', (input) => {
    expect(checkCommunitySlug(input).ok).toBe(false);
  });
});
