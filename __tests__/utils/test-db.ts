/**
 * Test database utilities for Neon integration tests
 *
 * Connects to a dedicated test Neon branch via TEST_DATABASE_URL.
 * Never falls back to DATABASE_URL — running tests against prod would
 * delete real rows in cleanupTestData().
 */
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { resolve } from 'path';
import crypto from 'crypto';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for tests. Never run tests against prod DB.',
  );
}

export const testSql = neon(databaseUrl);

/**
 * Execute a typed SQL query
 */
export async function testQuery<T>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  return testSql(strings, ...values) as Promise<T[]>;
}

/**
 * Execute a typed SQL query expecting a single result
 */
export async function testQueryOne<T>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T | null> {
  const results = await testSql(strings, ...values) as T[];
  return results[0] ?? null;
}

// Test data IDs - will be populated during setup
//
// Note on the Better-Auth migration:
// - `profiles.id` is still UUID
// - `profiles.auth_user_id` is TEXT and references `"user".id`
// - All FK columns that used to point at `profiles.id` (communities.created_by,
//   community_members.user_id, threads.user_id, lessons.created_by,
//   private_lessons.teacher_id, live_classes.teacher_id, ...) now reference
//   the Better-Auth user TEXT id, NOT profiles.id.
//
// `userId` / `secondUserId` are the TEXT Better-Auth ids and the values that
// belong in those FK columns. `profileId` / `secondProfileId` are kept around
// for tests that still need to assert on the profiles row directly.
export const TEST_IDS = {
  userId: '',
  secondUserId: '',
  profileId: '',
  secondProfileId: '',
  communityId: '',
  communitySlug: '',
  courseId: '',
  courseSlug: '',
  chapterId: '',
  lessonId: '',
  privateLessonId: '',
  liveClassId: '',
  threadId: '',
  memberId: '',
};

/**
 * Create test data for integration tests
 */
export async function setupTestData(): Promise<typeof TEST_IDS> {
  // crypto.randomUUID() collision-free across re-runs and parallel workers
  const uniqueSuffix = crypto.randomUUID();
  const testEmail = `test-wave-${uniqueSuffix}@dancehub-test.com`;
  const secondTestEmail = `test-wave-member-${uniqueSuffix}@dancehub-test.com`;
  const communitySlug = `test-community-${uniqueSuffix}`.slice(0, 60);
  const courseSlug = `test-course-${uniqueSuffix}`.slice(0, 60);
  const userId = `test-user-${uniqueSuffix}`;
  const secondUserId = `test-user-member-${uniqueSuffix}`;

  // Create the Better-Auth user rows FIRST. Downstream FKs point here.
  // The DB has an `on_user_created` trigger on "user" that auto-inserts a
  // matching profile row (via create_profile_for_user). So we DO NOT insert
  // profiles manually here — we look up the auto-created ones after.
  await testSql`
    INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
    VALUES (
      ${userId},
      ${testEmail},
      'Test Creator User',
      false,
      NOW(),
      NOW()
    )
  `;
  TEST_IDS.userId = userId;

  await testSql`
    INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
    VALUES (
      ${secondUserId},
      ${secondTestEmail},
      'Test Member User',
      false,
      NOW(),
      NOW()
    )
  `;
  TEST_IDS.secondUserId = secondUserId;

  // Look up the trigger-created profiles.
  const profile = await testQueryOne<{ id: string }>`
    SELECT id FROM profiles WHERE auth_user_id = ${userId}
  `;
  if (!profile) {
    throw new Error('Expected on_user_created trigger to have inserted profile for creator');
  }
  TEST_IDS.profileId = profile.id;

  const secondProfile = await testQueryOne<{ id: string }>`
    SELECT id FROM profiles WHERE auth_user_id = ${secondUserId}
  `;
  if (!secondProfile) {
    throw new Error('Expected on_user_created trigger to have inserted profile for member');
  }
  TEST_IDS.secondProfileId = secondProfile.id;

  // Backfill the display_name / full_name overrides used by the views tests.
  await testSql`
    UPDATE profiles
    SET display_name = ${'test_creator_' + uniqueSuffix.slice(0, 8)},
        full_name = 'Test Creator User'
    WHERE id = ${TEST_IDS.profileId}
  `;
  await testSql`
    UPDATE profiles
    SET display_name = ${'test_member_' + uniqueSuffix.slice(0, 8)},
        full_name = 'Test Member User'
    WHERE id = ${TEST_IDS.secondProfileId}
  `;

  // Communities — created_by references "user".id (TEXT)
  const community = await testQueryOne<{ id: string }>`
    INSERT INTO communities (id, name, slug, description, created_by, status, membership_enabled, membership_price)
    VALUES (
      gen_random_uuid(),
      'Test Integration Community',
      ${communitySlug},
      'A test community for integration tests',
      ${userId},
      'active',
      true,
      10.00
    )
    RETURNING id
  `;

  if (!community) throw new Error('Failed to create test community');
  TEST_IDS.communityId = community.id;
  TEST_IDS.communitySlug = communitySlug;

  // community_members.user_id is TEXT (Better-Auth user id)
  const member = await testQueryOne<{ id: string }>`
    INSERT INTO community_members (id, user_id, community_id, role, status)
    VALUES (
      gen_random_uuid(),
      ${secondUserId},
      ${TEST_IDS.communityId},
      'member',
      'active'
    )
    RETURNING id
  `;

  if (!member) throw new Error('Failed to create test member');
  TEST_IDS.memberId = member.id;

  // courses.created_by is TEXT (Better-Auth user id)
  const course = await testQueryOne<{ id: string }>`
    INSERT INTO courses (id, title, slug, description, community_id, created_by, is_public)
    VALUES (
      gen_random_uuid(),
      'Test Integration Course',
      ${courseSlug},
      'A test course for integration tests',
      ${TEST_IDS.communityId},
      ${userId},
      true
    )
    RETURNING id
  `;

  if (!course) throw new Error('Failed to create test course');
  TEST_IDS.courseId = course.id;
  TEST_IDS.courseSlug = courseSlug;

  const chapter = await testQueryOne<{ id: string }>`
    INSERT INTO chapters (id, title, chapter_position, course_id)
    VALUES (
      gen_random_uuid(),
      'Test Integration Chapter',
      1,
      ${TEST_IDS.courseId}
    )
    RETURNING id
  `;

  if (!chapter) throw new Error('Failed to create test chapter');
  TEST_IDS.chapterId = chapter.id;

  // lessons.created_by is TEXT (Better-Auth user id)
  const lesson = await testQueryOne<{ id: string }>`
    INSERT INTO lessons (id, title, content, lesson_position, chapter_id, created_by)
    VALUES (
      gen_random_uuid(),
      'Test Integration Lesson',
      'Test lesson content for integration tests',
      1,
      ${TEST_IDS.chapterId},
      ${userId}
    )
    RETURNING id
  `;

  if (!lesson) throw new Error('Failed to create test lesson');
  TEST_IDS.lessonId = lesson.id;

  // private_lessons.teacher_id is TEXT (Better-Auth user id)
  const privateLesson = await testQueryOne<{ id: string }>`
    INSERT INTO private_lessons (id, community_id, teacher_id, title, description, duration_minutes, regular_price, is_active)
    VALUES (
      gen_random_uuid(),
      ${TEST_IDS.communityId},
      ${userId},
      'Test Integration Private Lesson',
      'A test private lesson for integration tests',
      60,
      50.00,
      true
    )
    RETURNING id
  `;

  if (!privateLesson) throw new Error('Failed to create test private lesson');
  TEST_IDS.privateLessonId = privateLesson.id;

  // live_classes.teacher_id is TEXT (Better-Auth user id)
  const liveClass = await testQueryOne<{ id: string }>`
    INSERT INTO live_classes (id, community_id, teacher_id, title, description, scheduled_start_time, duration_minutes, status)
    VALUES (
      gen_random_uuid(),
      ${TEST_IDS.communityId},
      ${userId},
      'Test Integration Live Class',
      'A test live class for integration tests',
      NOW() + INTERVAL '1 day',
      60,
      'scheduled'
    )
    RETURNING id
  `;

  if (!liveClass) throw new Error('Failed to create test live class');
  TEST_IDS.liveClassId = liveClass.id;

  // threads.user_id and threads.created_by are TEXT (Better-Auth user id)
  const thread = await testQueryOne<{ id: string }>`
    INSERT INTO threads (id, title, content, user_id, community_id, created_by, author_name)
    VALUES (
      gen_random_uuid(),
      'Test Integration Thread',
      'Test thread content for integration tests',
      ${userId},
      ${TEST_IDS.communityId},
      ${userId},
      'Test Creator User'
    )
    RETURNING id
  `;

  if (!thread) throw new Error('Failed to create test thread');
  TEST_IDS.threadId = thread.id;

  return TEST_IDS;
}

/**
 * Clean up test data after tests
 */
export async function cleanupTestData(): Promise<void> {
  // Delete in reverse order of creation (respecting foreign keys)
  if (TEST_IDS.threadId) {
    await testSql`DELETE FROM threads WHERE id = ${TEST_IDS.threadId}`;
  }
  if (TEST_IDS.liveClassId) {
    await testSql`DELETE FROM live_classes WHERE id = ${TEST_IDS.liveClassId}`;
  }
  if (TEST_IDS.privateLessonId) {
    await testSql`DELETE FROM private_lessons WHERE id = ${TEST_IDS.privateLessonId}`;
  }
  if (TEST_IDS.lessonId) {
    await testSql`DELETE FROM lessons WHERE id = ${TEST_IDS.lessonId}`;
  }
  if (TEST_IDS.chapterId) {
    await testSql`DELETE FROM chapters WHERE id = ${TEST_IDS.chapterId}`;
  }
  if (TEST_IDS.courseId) {
    await testSql`DELETE FROM courses WHERE id = ${TEST_IDS.courseId}`;
  }
  if (TEST_IDS.memberId) {
    await testSql`DELETE FROM community_members WHERE id = ${TEST_IDS.memberId}`;
  }
  if (TEST_IDS.communityId) {
    await testSql`DELETE FROM communities WHERE id = ${TEST_IDS.communityId}`;
  }
  if (TEST_IDS.secondProfileId) {
    await testSql`DELETE FROM profiles WHERE id = ${TEST_IDS.secondProfileId}`;
  }
  if (TEST_IDS.profileId) {
    await testSql`DELETE FROM profiles WHERE id = ${TEST_IDS.profileId}`;
  }
  // "user" rows last — profiles FK back to them via auth_user_id.
  if (TEST_IDS.secondUserId) {
    await testSql`DELETE FROM "user" WHERE id = ${TEST_IDS.secondUserId}`;
  }
  if (TEST_IDS.userId) {
    await testSql`DELETE FROM "user" WHERE id = ${TEST_IDS.userId}`;
  }

  // Reset IDs
  TEST_IDS.userId = '';
  TEST_IDS.secondUserId = '';
  TEST_IDS.profileId = '';
  TEST_IDS.secondProfileId = '';
  TEST_IDS.communityId = '';
  TEST_IDS.communitySlug = '';
  TEST_IDS.courseId = '';
  TEST_IDS.courseSlug = '';
  TEST_IDS.chapterId = '';
  TEST_IDS.lessonId = '';
  TEST_IDS.privateLessonId = '';
  TEST_IDS.liveClassId = '';
  TEST_IDS.threadId = '';
  TEST_IDS.memberId = '';
}
