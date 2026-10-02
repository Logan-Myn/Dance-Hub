import { randomUUID } from 'crypto';
import { queryOne } from '@/lib/db';
import { slugify } from '@/lib/utils';

/**
 * Base slug for a course title. slugify drops anything outside ASCII word
 * characters, so a title in another script gives an empty slug; that gets a
 * short random id instead.
 */
export function courseSlugBase(title: string): string {
  const base = slugify(title.trim()).replace(/^[-_]+|[-_]+$/g, '');
  return base || `course-${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

/**
 * A slug for `title` that no other course in the community uses, suffixed
 * -2, -3, ... on collision. Every course route resolves the course by
 * (community, slug), so duplicates would let an edit or delete hit the wrong
 * course. The unique index on courses (community_id, slug) is the last guard
 * against two concurrent requests picking the same slug.
 */
export async function uniqueCourseSlug(
  communityId: string,
  title: string,
  excludeCourseId: string | null = null
): Promise<string> {
  const base = courseSlugBase(title);
  let candidate = base;
  let n = 1;
  while (true) {
    const collision = await queryOne<{ id: string }>`
      SELECT id FROM courses
      WHERE community_id = ${communityId}
        AND slug = ${candidate}
        AND id IS DISTINCT FROM ${excludeCourseId}
      LIMIT 1
    `;
    if (!collision) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

/** Postgres unique_violation, e.g. losing the slug to a concurrent create. */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505';
}
