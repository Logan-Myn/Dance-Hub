/**
 * Waves 1-4 Integration Tests - API Routes Migration Validation
 *
 * Wave 1: Lib files (fetcher.ts, video-room-service.ts, etc.)
 * Wave 2: Simple API routes (1-2 Supabase calls)
 * Wave 3: Low Complexity (3-4 Supabase calls)
 * Wave 4: Medium Complexity (5-9 Supabase calls)
 *
 * Tests database layer patterns to validate Neon migration
 */

import {
  testQuery,
  testQueryOne,
  testSql,
  setupTestData,
  cleanupTestData,
  TEST_IDS,
} from '../utils/test-db';

// ============================================================================
// Type Definitions (matching migrated API routes)
// ============================================================================

interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
}

interface Community {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_by: string;
  status: string;
  membership_enabled: boolean;
  membership_price: number | null;
  thread_categories: any;
  custom_links: any;
  image_url: string | null;
}

interface CommunityMember {
  id: string;
  user_id: string;
  community_id: string;
  role: string;
  status: string;
  joined_at: string;
}

interface Thread {
  id: string;
  title: string;
  content: string;
  user_id: string;
  community_id: string;
  created_by: string;
  likes: string[];
  pinned: boolean;
  created_at: string;
}

interface Course {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  community_id: string;
  is_public: boolean;
}

interface Chapter {
  id: string;
  title: string;
  chapter_position: number;
  course_id: string;
}

interface Lesson {
  id: string;
  title: string;
  content: string | null;
  lesson_position: number;
  chapter_id: string;
}

interface PrivateLesson {
  id: string;
  community_id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  regular_price: number;
  is_active: boolean;
}

interface LiveClass {
  id: string;
  community_id: string;
  teacher_id: string;
  title: string;
  status: string;
  scheduled_start_time: string;
}

interface MemberCount {
  count: number;
}

// ============================================================================
// Test Suite Setup
// ============================================================================

describe('Waves 1-4 Integration Tests - Neon Database Layer', () => {
  beforeAll(async () => {
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  // ==========================================================================
  // WAVE 1: Lib Files Tests
  // ==========================================================================
  describe('Wave 1: Lib Files', () => {
    describe('video-room-service.ts patterns', () => {
      it('should query booking details with joins', async () => {
        // Pattern from video-room-service.ts - complex booking queries
        const bookings = await testQuery<{ id: string; community_id: string }>`
          SELECT lb.id, lb.community_id
          FROM lesson_bookings lb
          WHERE lb.community_id = ${TEST_IDS.communityId}
          LIMIT 5
        `;
        // May be empty but query should work
        expect(Array.isArray(bookings)).toBe(true);
      });

      it('should query live class details', async () => {
        const liveClass = await testQueryOne<LiveClass>`
          SELECT id, community_id, teacher_id, title, status, scheduled_start_time
          FROM live_classes
          WHERE id = ${TEST_IDS.liveClassId}
        `;
        expect(liveClass).not.toBeNull();
        expect(liveClass?.title).toBe('Test Integration Live Class');
      });
    });

    describe('fetcher.ts patterns', () => {
      it('should fetch community by slug', async () => {
        const community = await testQueryOne<Community>`
          SELECT id, name, slug, description, created_by, status,
                 membership_enabled, membership_price, thread_categories,
                 custom_links, image_url
          FROM communities
          WHERE slug = ${TEST_IDS.communitySlug}
        `;
        expect(community).not.toBeNull();
        expect(community?.name).toBe('Test Integration Community');
      });

      it('should fetch community members', async () => {
        const members = await testQuery<CommunityMember & { display_name: string | null }>`
          SELECT cm.*, p.display_name
          FROM community_members cm
          JOIN profiles p ON p.auth_user_id = cm.user_id
          WHERE cm.community_id = ${TEST_IDS.communityId}
        `;
        expect(members.length).toBeGreaterThan(0);
      });

      it('should fetch community threads', async () => {
        const threads = await testQuery<Thread>`
          SELECT * FROM threads
          WHERE community_id = ${TEST_IDS.communityId}
          ORDER BY created_at DESC
        `;
        expect(threads.length).toBeGreaterThan(0);
        expect(threads[0].title).toBe('Test Integration Thread');
      });

      it('should fetch courses by community', async () => {
        const courses = await testQuery<Course>`
          SELECT * FROM courses
          WHERE community_id = ${TEST_IDS.communityId}
        `;
        expect(courses.length).toBeGreaterThan(0);
      });

      it('should fetch profile by id', async () => {
        const profile = await testQueryOne<Profile>`
          SELECT * FROM profiles WHERE id = ${TEST_IDS.profileId}
        `;
        expect(profile).not.toBeNull();
        expect(profile?.full_name).toBe('Test Creator User');
      });
    });
  });

  // ==========================================================================
  // WAVE 2: Simple API Routes (1-2 calls)
  // ==========================================================================
  describe('Wave 2: Simple API Routes (1-2 calls)', () => {
    describe('threads/[threadId]/route.ts', () => {
      it('should update thread title and content', async () => {
        const newTitle = 'Updated Thread Title';
        const newContent = 'Updated thread content';

        await testSql`
          UPDATE threads
          SET title = ${newTitle}, content = ${newContent}, updated_at = NOW()
          WHERE id = ${TEST_IDS.threadId}
        `;

        const updated = await testQueryOne<Thread>`
          SELECT * FROM threads WHERE id = ${TEST_IDS.threadId}
        `;
        expect(updated?.title).toBe(newTitle);
        expect(updated?.content).toBe(newContent);

        // Restore
        await testSql`
          UPDATE threads
          SET title = 'Test Integration Thread', content = 'Test thread content for integration tests'
          WHERE id = ${TEST_IDS.threadId}
        `;
      });
    });

    describe('threads/[threadId]/like/route.ts', () => {
      it('should add like to thread', async () => {
        // threads.likes is TEXT[] post Better-Auth migration; entries are
        // Better-Auth user ids, no ::uuid cast.
        await testSql`
          UPDATE threads
          SET likes = array_append(COALESCE(likes, '{}'), ${TEST_IDS.secondUserId})
          WHERE id = ${TEST_IDS.threadId}
        `;

        const thread = await testQueryOne<{ likes: string[] }>`
          SELECT likes FROM threads WHERE id = ${TEST_IDS.threadId}
        `;
        expect(thread?.likes).toContain(TEST_IDS.secondUserId);

        // Remove the like
        await testSql`
          UPDATE threads
          SET likes = array_remove(likes, ${TEST_IDS.secondUserId})
          WHERE id = ${TEST_IDS.threadId}
        `;
      });
    });

    describe('community/[communitySlug]/members/route.ts', () => {
      it('should query community members with profiles', async () => {
        const members = await testQuery<CommunityMember & Profile>`
          SELECT cm.*, p.full_name, p.avatar_url, p.display_name
          FROM community_members cm
          JOIN profiles p ON p.auth_user_id = cm.user_id
          WHERE cm.community_id = ${TEST_IDS.communityId}
          AND cm.status = 'active'
        `;
        expect(members.length).toBeGreaterThan(0);
      });
    });

    describe('community/[communitySlug]/about/route.ts', () => {
      it('should query community about page data', async () => {
        const community = await testQueryOne<{ id: string; about_page: any }>`
          SELECT id, about_page
          FROM communities
          WHERE slug = ${TEST_IDS.communitySlug}
        `;
        expect(community).not.toBeNull();
      });
    });

    describe('community/[communitySlug]/isCreator/route.ts', () => {
      it('should check if user is community creator', async () => {
        const community = await testQueryOne<{ created_by: string }>`
          SELECT created_by
          FROM communities
          WHERE slug = ${TEST_IDS.communitySlug}
        `;
        // communities.created_by is TEXT (Better-Auth user id) post-migration.
        expect(community?.created_by).toBe(TEST_IDS.userId);
      });
    });

    describe('community/[communitySlug]/route.ts', () => {
      it('should fetch community by slug', async () => {
        const community = await testQueryOne<Community>`
          SELECT * FROM communities WHERE slug = ${TEST_IDS.communitySlug}
        `;
        expect(community).not.toBeNull();
        expect(community?.id).toBe(TEST_IDS.communityId);
      });
    });

    describe('community/[communitySlug]/threads/route.ts', () => {
      it('should fetch threads for community', async () => {
        const threads = await testQuery<Thread>`
          SELECT * FROM threads
          WHERE community_id = ${TEST_IDS.communityId}
          ORDER BY pinned DESC, created_at DESC
        `;
        expect(threads.length).toBeGreaterThan(0);
      });
    });

    describe('community/[communitySlug]/categories/route.ts', () => {
      it('should fetch community thread categories', async () => {
        const community = await testQueryOne<{ thread_categories: any }>`
          SELECT thread_categories FROM communities
          WHERE slug = ${TEST_IDS.communitySlug}
        `;
        expect(community).not.toBeNull();
      });
    });
  });

  // ==========================================================================
  // WAVE 3: Low Complexity (3-4 calls)
  // ==========================================================================
  describe('Wave 3: Low Complexity (3-4 calls)', () => {
    describe('community/create/route.ts', () => {
      it('should create community with all required fields', async () => {
        const testSlug = `test-create-${Date.now()}`;

        const newCommunity = await testQueryOne<Community>`
          INSERT INTO communities (name, slug, description, created_by, status)
          VALUES (
            'Test Create Community',
            ${testSlug},
            'Created for testing',
            ${TEST_IDS.userId},
            'active'
          )
          RETURNING *
        `;

        expect(newCommunity).not.toBeNull();
        expect(newCommunity?.slug).toBe(testSlug);

        // Cleanup
        await testSql`DELETE FROM communities WHERE slug = ${testSlug}`;
      });
    });

    describe('community/[communitySlug]/courses/route.ts', () => {
      it('should fetch courses for community', async () => {
        const community = await testQueryOne<{ id: string }>`
          SELECT id FROM communities WHERE slug = ${TEST_IDS.communitySlug}
        `;
        expect(community).not.toBeNull();

        const courses = await testQuery<Course>`
          SELECT * FROM courses
          WHERE community_id = ${community!.id}
          AND is_public = true
        `;
        expect(courses.length).toBeGreaterThan(0);
      });
    });

    describe('threads/create/route.ts', () => {
      it('should create thread with all fields', async () => {
        const newThread = await testQueryOne<Thread>`
          INSERT INTO threads (title, content, user_id, community_id, created_by, author_name)
          VALUES (
            'New Test Thread',
            'New test thread content',
            ${TEST_IDS.userId},
            ${TEST_IDS.communityId},
            ${TEST_IDS.userId},
            'Test Creator User'
          )
          RETURNING *
        `;

        expect(newThread).not.toBeNull();
        expect(newThread?.title).toBe('New Test Thread');

        // Cleanup
        await testSql`DELETE FROM threads WHERE id = ${newThread!.id}`;
      });
    });

    describe('threads/[threadId]/comments/route.ts', () => {
      it('should handle thread comments array', async () => {
        // Update comments count
        await testSql`
          UPDATE threads
          SET comments_count = COALESCE(comments_count, 0) + 1
          WHERE id = ${TEST_IDS.threadId}
        `;

        const thread = await testQueryOne<{ comments_count: number }>`
          SELECT comments_count FROM threads WHERE id = ${TEST_IDS.threadId}
        `;
        expect(thread?.comments_count).toBeGreaterThan(0);

        // Reset
        await testSql`
          UPDATE threads SET comments_count = 0 WHERE id = ${TEST_IDS.threadId}
        `;
      });
    });

    describe('threads/[threadId]/pin/route.ts', () => {
      it('should pin and unpin thread', async () => {
        // Pin the thread
        await testSql`
          UPDATE threads SET pinned = true WHERE id = ${TEST_IDS.threadId}
        `;

        let thread = await testQueryOne<{ pinned: boolean }>`
          SELECT pinned FROM threads WHERE id = ${TEST_IDS.threadId}
        `;
        expect(thread?.pinned).toBe(true);

        // Unpin
        await testSql`
          UPDATE threads SET pinned = false WHERE id = ${TEST_IDS.threadId}
        `;

        thread = await testQueryOne<{ pinned: boolean }>`
          SELECT pinned FROM threads WHERE id = ${TEST_IDS.threadId}
        `;
        expect(thread?.pinned).toBe(false);
      });
    });

    describe('community/[communitySlug]/update/route.ts', () => {
      it('should update community fields', async () => {
        const newDescription = 'Updated description for testing';

        await testSql`
          UPDATE communities
          SET description = ${newDescription}, updated_at = NOW()
          WHERE slug = ${TEST_IDS.communitySlug}
        `;

        const community = await testQueryOne<{ description: string }>`
          SELECT description FROM communities WHERE slug = ${TEST_IDS.communitySlug}
        `;
        expect(community?.description).toBe(newDescription);

        // Restore
        await testSql`
          UPDATE communities
          SET description = 'A test community for integration tests'
          WHERE slug = ${TEST_IDS.communitySlug}
        `;
      });
    });

    describe('community/[communitySlug]/membership/[userId]/route.ts', () => {
      it('should query membership status', async () => {
        const membership = await testQueryOne<CommunityMember>`
          SELECT * FROM community_members
          WHERE community_id = ${TEST_IDS.communityId}
          AND user_id = ${TEST_IDS.secondUserId}
        `;
        expect(membership).not.toBeNull();
        expect(membership?.status).toBe('active');
      });
    });
  });

  // ==========================================================================
  // WAVE 4: Medium Complexity (5-9 calls)
  // ==========================================================================
  describe('Wave 4: Medium Complexity (5-9 calls)', () => {
    describe('community/[communitySlug]/stats/route.ts', () => {
      it('should calculate community statistics', async () => {
        const community = await testQueryOne<Community>`
          SELECT id, created_by FROM communities WHERE slug = ${TEST_IDS.communitySlug}
        `;
        expect(community).not.toBeNull();

        // Count members (excluding creator)
        const membersResult = await testQueryOne<MemberCount>`
          SELECT COUNT(*)::int as count
          FROM community_members
          WHERE community_id = ${community!.id}
          AND user_id != ${community!.created_by}
        `;
        expect(membersResult?.count).toBeGreaterThanOrEqual(0);

        // Count threads
        const threads = await testQuery<{ id: string }>`
          SELECT id FROM threads WHERE community_id = ${community!.id}
        `;
        expect(threads.length).toBeGreaterThanOrEqual(0);

        // Count active members
        const activeResult = await testQueryOne<MemberCount>`
          SELECT COUNT(*)::int as count
          FROM community_members
          WHERE community_id = ${community!.id}
          AND status = 'active'
        `;
        expect(activeResult?.count).toBeGreaterThanOrEqual(0);
      });
    });

    describe('community/[communitySlug]/teacher-availability/route.ts', () => {
      it('should query teacher availability slots', async () => {
        const slots = await testQuery<{ id: string }>`
          SELECT * FROM teacher_availability_slots
          WHERE teacher_id = ${TEST_IDS.userId}
          LIMIT 10
        `;
        // May be empty but query should work
        expect(Array.isArray(slots)).toBe(true);
      });
    });

    describe('community/[communitySlug]/leave/route.ts', () => {
      it('should handle member leaving community', async () => {
        // Create a temporary member to leave. community_members.user_id is TEXT.
        const tempMember = await testQueryOne<{ id: string }>`
          INSERT INTO community_members (user_id, community_id, role, status)
          VALUES (${TEST_IDS.userId}, ${TEST_IDS.communityId}, 'member', 'active')
          ON CONFLICT (user_id, community_id) DO NOTHING
          RETURNING id
        `;

        if (tempMember) {
          // Delete the membership (leave)
          await testSql`
            DELETE FROM community_members WHERE id = ${tempMember.id}
          `;

          // Verify deleted
          const deleted = await testQueryOne<{ id: string }>`
            SELECT id FROM community_members WHERE id = ${tempMember.id}
          `;
          expect(deleted).toBeNull();
        }
      });
    });

    describe('community/[communitySlug]/join/route.ts', () => {
      it('should handle joining community', async () => {
        // Check if already a member. community_members.user_id is TEXT.
        const existingMember = await testQueryOne<{ id: string }>`
          SELECT id FROM community_members
          WHERE user_id = ${TEST_IDS.userId}
          AND community_id = ${TEST_IDS.communityId}
        `;

        if (!existingMember) {
          // Join the community
          const newMember = await testQueryOne<CommunityMember>`
            INSERT INTO community_members (user_id, community_id, role, status)
            VALUES (${TEST_IDS.userId}, ${TEST_IDS.communityId}, 'member', 'active')
            RETURNING *
          `;
          expect(newMember).not.toBeNull();

          // Cleanup
          await testSql`DELETE FROM community_members WHERE id = ${newMember!.id}`;
        }
      });
    });

    describe('community/[communitySlug]/private-lessons/route.ts', () => {
      it('should fetch private lessons for community', async () => {
        const community = await testQueryOne<{ id: string }>`
          SELECT id FROM communities WHERE slug = ${TEST_IDS.communitySlug}
        `;
        expect(community).not.toBeNull();

        const lessons = await testQuery<PrivateLesson>`
          SELECT * FROM private_lessons
          WHERE community_id = ${community!.id}
          AND is_active = true
        `;
        expect(lessons.length).toBeGreaterThan(0);
      });
    });

    describe('community/[communitySlug]/live-classes/route.ts', () => {
      it('should fetch live classes for community', async () => {
        const community = await testQueryOne<{ id: string }>`
          SELECT id FROM communities WHERE slug = ${TEST_IDS.communitySlug}
        `;
        expect(community).not.toBeNull();

        const classes = await testQuery<LiveClass>`
          SELECT * FROM live_classes
          WHERE community_id = ${community!.id}
          AND status != 'cancelled'
          ORDER BY scheduled_start_time ASC
        `;
        expect(classes.length).toBeGreaterThan(0);
      });
    });

    describe('community/[communitySlug]/courses/[courseSlug]/chapters/reorder/route.ts', () => {
      it('should reorder chapters', async () => {
        // Get chapters
        const chapters = await testQuery<Chapter>`
          SELECT * FROM chapters
          WHERE course_id = ${TEST_IDS.courseId}
          ORDER BY chapter_position ASC
        `;

        if (chapters.length > 0) {
          // Update position
          await testSql`
            UPDATE chapters
            SET chapter_position = 99
            WHERE id = ${chapters[0].id}
          `;

          const updated = await testQueryOne<{ chapter_position: number }>`
            SELECT chapter_position FROM chapters WHERE id = ${chapters[0].id}
          `;
          expect(updated?.chapter_position).toBe(99);

          // Restore
          await testSql`
            UPDATE chapters SET chapter_position = 1 WHERE id = ${chapters[0].id}
          `;
        }
      });
    });

    describe('community/[communitySlug]/courses/[courseSlug]/chapters/[chapterId]/lessons/route.ts', () => {
      it('should fetch lessons for chapter', async () => {
        const lessons = await testQuery<Lesson>`
          SELECT * FROM lessons
          WHERE chapter_id = ${TEST_IDS.chapterId}
          ORDER BY lesson_position ASC
        `;
        expect(lessons.length).toBeGreaterThan(0);
      });

      it('should create new lesson', async () => {
        // Get max position
        const maxPos = await testQueryOne<{ max: number }>`
          SELECT COALESCE(MAX(lesson_position), 0) as max
          FROM lessons
          WHERE chapter_id = ${TEST_IDS.chapterId}
        `;

        const newLesson = await testQueryOne<Lesson>`
          INSERT INTO lessons (title, content, lesson_position, chapter_id, created_by)
          VALUES (
            'New Test Lesson',
            'New lesson content',
            ${(maxPos?.max || 0) + 1},
            ${TEST_IDS.chapterId},
            ${TEST_IDS.userId}
          )
          RETURNING *
        `;

        expect(newLesson).not.toBeNull();

        // Cleanup
        await testSql`DELETE FROM lessons WHERE id = ${newLesson!.id}`;
      });
    });

    describe('community/[communitySlug]/courses/[courseSlug]/chapters/[chapterId]/route.ts', () => {
      it('should update chapter', async () => {
        const newTitle = 'Updated Chapter Title';

        const updated = await testQueryOne<Chapter>`
          UPDATE chapters
          SET title = ${newTitle}, updated_at = NOW()
          WHERE id = ${TEST_IDS.chapterId}
          RETURNING *
        `;

        expect(updated?.title).toBe(newTitle);

        // Restore
        await testSql`
          UPDATE chapters SET title = 'Test Integration Chapter' WHERE id = ${TEST_IDS.chapterId}
        `;
      });
    });
  });

  // ==========================================================================
  // SQL Pattern Validation Tests
  // ==========================================================================
  describe('SQL Pattern Validation', () => {
    it('should handle COUNT with type casting', async () => {
      const result = await testQueryOne<{ count: number }>`
        SELECT COUNT(*)::int as count FROM communities WHERE id = ${TEST_IDS.communityId}
      `;
      expect(result?.count).toBe(1);
    });

    it('should handle COALESCE with default values', async () => {
      const result = await testQueryOne<{ value: number }>`
        SELECT COALESCE(NULL, 0) as value
      `;
      expect(result?.value).toBe(0);
    });

    it('should handle date comparisons', async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const threads = await testQuery<Thread>`
        SELECT * FROM threads
        WHERE community_id = ${TEST_IDS.communityId}
        AND created_at >= ${thirtyDaysAgo.toISOString()}
      `;
      expect(threads.length).toBeGreaterThan(0);
    });

    it('should handle JOIN queries', async () => {
      const membersWithProfiles = await testQuery<CommunityMember & { full_name: string }>`
        SELECT cm.*, p.full_name
        FROM community_members cm
        INNER JOIN profiles p ON p.auth_user_id = cm.user_id
        WHERE cm.community_id = ${TEST_IDS.communityId}
      `;
      expect(membersWithProfiles.length).toBeGreaterThan(0);
    });

    it('should handle ORDER BY with multiple columns', async () => {
      const threads = await testQuery<Thread>`
        SELECT * FROM threads
        WHERE community_id = ${TEST_IDS.communityId}
        ORDER BY pinned DESC, created_at DESC
      `;
      expect(Array.isArray(threads)).toBe(true);
    });

    it('should handle array operations (array_append/array_remove)', async () => {
      // threads.likes is TEXT[] now (Better-Auth migration), no uuid cast.
      await testSql`
        UPDATE threads
        SET likes = array_append(COALESCE(likes, '{}'), ${TEST_IDS.userId})
        WHERE id = ${TEST_IDS.threadId}
      `;

      let thread = await testQueryOne<{ likes: string[] }>`
        SELECT likes FROM threads WHERE id = ${TEST_IDS.threadId}
      `;
      expect(thread?.likes).toContain(TEST_IDS.userId);

      // Remove from array
      await testSql`
        UPDATE threads
        SET likes = array_remove(likes, ${TEST_IDS.userId})
        WHERE id = ${TEST_IDS.threadId}
      `;

      thread = await testQueryOne<{ likes: string[] }>`
        SELECT likes FROM threads WHERE id = ${TEST_IDS.threadId}
      `;
      expect(thread?.likes).not.toContain(TEST_IDS.userId);
    });

    it('should handle ON CONFLICT (upsert)', async () => {
      // This tests the upsert pattern - will either insert or do nothing.
      // community_members.user_id is TEXT (Better-Auth user id).
      const result = await testQuery<{ id: string }>`
        INSERT INTO community_members (user_id, community_id, role, status)
        VALUES (${TEST_IDS.secondUserId}, ${TEST_IDS.communityId}, 'member', 'active')
        ON CONFLICT (user_id, community_id) DO NOTHING
        RETURNING id
      `;
      // Should return empty (already exists) or the new id
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
