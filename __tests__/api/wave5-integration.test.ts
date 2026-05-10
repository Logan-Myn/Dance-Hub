/**
 * Wave 5 Integration Tests - High Complexity API Routes
 *
 * Tests the Neon database layer for migrated Wave 5 routes:
 * 1. courses/[courseSlug]/route.ts - Course CRUD with nested chapters/lessons
 * 2. private-lessons/[lessonId]/route.ts - Private lesson management
 * 3. chapters/route.ts - Chapter CRUD operations
 * 4. lessons/[lessonId]/route.ts - Lesson CRUD operations
 * 5. live-classes/[classId]/route.ts - Live class management
 * 6. admin/courses/[courseId]/route.ts - Admin course operations
 *
 * Note: webhooks/stripe/route.ts is not tested here as it requires Stripe webhook signatures
 */

import {
  testQuery,
  testQueryOne,
  testSql,
  setupTestData,
  cleanupTestData,
  TEST_IDS,
} from '../utils/test-db';

// Interfaces matching the migrated API routes
interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  full_name: string | null;
  is_admin: boolean;
}

interface Community {
  id: string;
  name: string;
  slug: string;
  created_by: string;
  status: string;
}

interface Course {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  community_id: string;
  created_by: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

interface Chapter {
  id: string;
  title: string;
  chapter_position: number;
  course_id: string;
  created_at: string;
  updated_at: string;
}

interface Lesson {
  id: string;
  title: string;
  content: string | null;
  video_asset_id: string | null;
  playback_id: string | null;
  lesson_position: number;
  chapter_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface PrivateLesson {
  id: string;
  community_id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  regular_price: number;
  member_price: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface LiveClass {
  id: string;
  community_id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  scheduled_start_time: string;
  duration_minutes: number;
  daily_room_name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

describe('Wave 5 Integration Tests - Neon Database Layer', () => {
  beforeAll(async () => {
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('1. Database Connection', () => {
    it('should connect to Neon database', async () => {
      const result = await testQueryOne<{ now: string }>`SELECT NOW() as now`;
      expect(result).not.toBeNull();
      expect(result?.now).toBeDefined();
    });
  });

  describe('2. Courses Route Tests (courses/[courseSlug]/route.ts)', () => {
    it('should query course by community and slug', async () => {
      // First get community slug
      const community = await testQueryOne<Community>`
        SELECT * FROM communities WHERE id = ${TEST_IDS.communityId}
      `;
      expect(community).not.toBeNull();

      // Get course by community
      const courses = await testQuery<Course>`
        SELECT * FROM courses WHERE community_id = ${TEST_IDS.communityId}
      `;
      expect(courses.length).toBeGreaterThan(0);

      const course = courses[0];
      expect(course.title).toBe('Test Integration Course');
    });

    it('should query course with nested chapters and lessons', async () => {
      // Get course
      const course = await testQueryOne<Course>`
        SELECT * FROM courses WHERE id = ${TEST_IDS.courseId}
      `;
      expect(course).not.toBeNull();

      // Get chapters for course
      const chapters = await testQuery<Chapter>`
        SELECT * FROM chapters
        WHERE course_id = ${TEST_IDS.courseId}
        ORDER BY chapter_position ASC
      `;
      expect(chapters.length).toBeGreaterThan(0);

      // Get lessons for chapters using ANY
      const chapterIds = chapters.map(c => c.id);
      const lessons = await testQuery<Lesson>`
        SELECT * FROM lessons
        WHERE chapter_id = ANY(${chapterIds})
        ORDER BY lesson_position ASC
      `;
      expect(lessons.length).toBeGreaterThan(0);

      // Group lessons by chapter (matching API route pattern)
      const lessonsByChapter = new Map<string, Lesson[]>();
      for (const lesson of lessons) {
        if (!lessonsByChapter.has(lesson.chapter_id)) {
          lessonsByChapter.set(lesson.chapter_id, []);
        }
        lessonsByChapter.get(lesson.chapter_id)!.push(lesson);
      }
      expect(lessonsByChapter.size).toBe(1);
    });

    it('should update course using COALESCE pattern', async () => {
      const newTitle = 'Updated Wave5 Course Title';
      const newDescription = 'Updated description';

      const updatedCourse = await testQueryOne<Course>`
        UPDATE courses
        SET
          title = COALESCE(${newTitle}, title),
          description = COALESCE(${newDescription}, description),
          updated_at = NOW()
        WHERE id = ${TEST_IDS.courseId}
        RETURNING *
      `;

      expect(updatedCourse).not.toBeNull();
      expect(updatedCourse?.title).toBe(newTitle);
      expect(updatedCourse?.description).toBe(newDescription);

      // Restore original title
      await testSql`
        UPDATE courses
        SET title = 'Test Integration Course', description = 'A test course for integration tests'
        WHERE id = ${TEST_IDS.courseId}
      `;
    });
  });

  describe('3. Private Lessons Route Tests (private-lessons/[lessonId]/route.ts)', () => {
    it('should query private lesson by id and community', async () => {
      const lesson = await testQueryOne<PrivateLesson>`
        SELECT * FROM private_lessons
        WHERE id = ${TEST_IDS.privateLessonId}
          AND community_id = ${TEST_IDS.communityId}
      `;

      expect(lesson).not.toBeNull();
      expect(lesson?.title).toBe('Test Integration Private Lesson');
      expect(lesson?.duration_minutes).toBe(60);
      expect(Number(lesson?.regular_price)).toBe(50);
    });

    it('should update private lesson with COALESCE', async () => {
      const newTitle = 'Updated Private Lesson';
      const newDuration = 90;

      const updated = await testQueryOne<PrivateLesson>`
        UPDATE private_lessons
        SET
          title = COALESCE(${newTitle}, title),
          duration_minutes = COALESCE(${newDuration}, duration_minutes),
          updated_at = NOW()
        WHERE id = ${TEST_IDS.privateLessonId}
          AND community_id = ${TEST_IDS.communityId}
        RETURNING *
      `;

      expect(updated).not.toBeNull();
      expect(updated?.title).toBe(newTitle);
      expect(updated?.duration_minutes).toBe(newDuration);

      // Restore original
      await testSql`
        UPDATE private_lessons
        SET title = 'Test Integration Private Lesson', duration_minutes = 60
        WHERE id = ${TEST_IDS.privateLessonId}
      `;
    });

    it('should query teacher profile for private lesson', async () => {
      const lesson = await testQueryOne<PrivateLesson>`
        SELECT * FROM private_lessons WHERE id = ${TEST_IDS.privateLessonId}
      `;
      expect(lesson).not.toBeNull();

      // private_lessons.teacher_id is the Better-Auth user id (TEXT), so we
      // join profiles via auth_user_id rather than profiles.id.
      const teacher = await testQueryOne<Profile>`
        SELECT id, display_name, full_name, avatar_url
        FROM profiles
        WHERE auth_user_id = ${lesson!.teacher_id}
      `;
      expect(teacher).not.toBeNull();
    });
  });

  describe('4. Chapters Route Tests (chapters/route.ts)', () => {
    it('should query chapters by course', async () => {
      const chapters = await testQuery<Chapter>`
        SELECT * FROM chapters
        WHERE course_id = ${TEST_IDS.courseId}
        ORDER BY chapter_position ASC
      `;

      expect(chapters.length).toBeGreaterThan(0);
      expect(chapters[0].title).toBe('Test Integration Chapter');
    });

    it('should create new chapter with correct position', async () => {
      // Get max position
      const maxPos = await testQueryOne<{ max: number }>`
        SELECT COALESCE(MAX(chapter_position), 0) as max
        FROM chapters
        WHERE course_id = ${TEST_IDS.courseId}
      `;

      const newPosition = (maxPos?.max || 0) + 1;

      const newChapter = await testQueryOne<Chapter>`
        INSERT INTO chapters (title, chapter_position, course_id)
        VALUES ('Test Chapter 2', ${newPosition}, ${TEST_IDS.courseId})
        RETURNING *
      `;

      expect(newChapter).not.toBeNull();
      expect(newChapter?.chapter_position).toBe(newPosition);

      // Clean up
      await testSql`DELETE FROM chapters WHERE id = ${newChapter!.id}`;
    });

    it('should update chapter title', async () => {
      const updated = await testQueryOne<Chapter>`
        UPDATE chapters
        SET title = 'Updated Chapter Title', updated_at = NOW()
        WHERE id = ${TEST_IDS.chapterId}
        RETURNING *
      `;

      expect(updated?.title).toBe('Updated Chapter Title');

      // Restore
      await testSql`
        UPDATE chapters SET title = 'Test Integration Chapter' WHERE id = ${TEST_IDS.chapterId}
      `;
    });
  });

  describe('5. Lessons Route Tests (lessons/[lessonId]/route.ts)', () => {
    it('should query lesson by id and chapter', async () => {
      const lesson = await testQueryOne<Lesson>`
        SELECT * FROM lessons
        WHERE id = ${TEST_IDS.lessonId}
          AND chapter_id = ${TEST_IDS.chapterId}
      `;

      expect(lesson).not.toBeNull();
      expect(lesson?.title).toBe('Test Integration Lesson');
    });

    it('should update lesson with COALESCE pattern', async () => {
      const newTitle = 'Updated Lesson Title';
      const newContent = 'Updated content';

      const updated = await testQueryOne<Lesson>`
        UPDATE lessons
        SET
          title = COALESCE(${newTitle}, title),
          content = COALESCE(${newContent}, content),
          updated_at = NOW()
        WHERE id = ${TEST_IDS.lessonId}
          AND chapter_id = ${TEST_IDS.chapterId}
        RETURNING *
      `;

      expect(updated).not.toBeNull();
      expect(updated?.title).toBe(newTitle);
      expect(updated?.content).toBe(newContent);

      // Restore
      await testSql`
        UPDATE lessons
        SET title = 'Test Integration Lesson', content = 'Test lesson content for integration tests'
        WHERE id = ${TEST_IDS.lessonId}
      `;
    });

    it('should handle video asset fields', async () => {
      const videoAssetId = 'test-video-asset-123';
      const playbackId = 'test-playback-456';

      const updated = await testQueryOne<Lesson>`
        UPDATE lessons
        SET
          video_asset_id = ${videoAssetId},
          playback_id = ${playbackId},
          updated_at = NOW()
        WHERE id = ${TEST_IDS.lessonId}
        RETURNING *
      `;

      expect(updated?.video_asset_id).toBe(videoAssetId);
      expect(updated?.playback_id).toBe(playbackId);

      // Clear video fields
      await testSql`
        UPDATE lessons
        SET video_asset_id = NULL, playback_id = NULL
        WHERE id = ${TEST_IDS.lessonId}
      `;
    });
  });

  describe('6. Live Classes Route Tests (live-classes/[classId]/route.ts)', () => {
    it('should query live class by id and community', async () => {
      // First get community
      const community = await testQueryOne<Community>`
        SELECT id FROM communities WHERE id = ${TEST_IDS.communityId}
      `;
      expect(community).not.toBeNull();

      const liveClass = await testQueryOne<LiveClass>`
        SELECT * FROM live_classes
        WHERE id = ${TEST_IDS.liveClassId}
          AND community_id = ${community!.id}
      `;

      expect(liveClass).not.toBeNull();
      expect(liveClass?.title).toBe('Test Integration Live Class');
      expect(liveClass?.status).toBe('scheduled');
    });

    it('should query live class with teacher details using view', async () => {
      // Test the live_classes_with_details view
      const liveClassWithDetails = await testQueryOne<LiveClass & { teacher_display_name: string | null }>`
        SELECT * FROM live_classes_with_details
        WHERE id = ${TEST_IDS.liveClassId}
      `;

      expect(liveClassWithDetails).not.toBeNull();
      expect(liveClassWithDetails?.title).toBe('Test Integration Live Class');
    });

    it('should update live class with COALESCE', async () => {
      const newTitle = 'Updated Live Class';
      const newDuration = 90;

      const updated = await testQueryOne<LiveClass>`
        UPDATE live_classes
        SET
          title = COALESCE(${newTitle}, title),
          duration_minutes = COALESCE(${newDuration}, duration_minutes),
          updated_at = NOW()
        WHERE id = ${TEST_IDS.liveClassId}
        RETURNING *
      `;

      expect(updated?.title).toBe(newTitle);
      expect(updated?.duration_minutes).toBe(newDuration);

      // Restore
      await testSql`
        UPDATE live_classes
        SET title = 'Test Integration Live Class', duration_minutes = 60
        WHERE id = ${TEST_IDS.liveClassId}
      `;
    });

    it('should soft delete live class by setting status to cancelled', async () => {
      // Soft delete
      await testSql`
        UPDATE live_classes
        SET status = 'cancelled', updated_at = NOW()
        WHERE id = ${TEST_IDS.liveClassId}
      `;

      const cancelled = await testQueryOne<LiveClass>`
        SELECT * FROM live_classes WHERE id = ${TEST_IDS.liveClassId}
      `;
      expect(cancelled?.status).toBe('cancelled');

      // Restore
      await testSql`
        UPDATE live_classes SET status = 'scheduled' WHERE id = ${TEST_IDS.liveClassId}
      `;
    });
  });

  describe('7. Admin Courses Route Tests (admin/courses/[courseId]/route.ts)', () => {
    it('should check admin status from profile', async () => {
      const profile = await testQueryOne<Profile>`
        SELECT is_admin FROM profiles WHERE id = ${TEST_IDS.profileId}
      `;

      expect(profile).not.toBeNull();
      expect(profile?.is_admin).toBe(false);
    });

    it('should query course chapters for cascade operations', async () => {
      const chapters = await testQuery<{ id: string }>`
        SELECT id FROM chapters WHERE course_id = ${TEST_IDS.courseId}
      `;

      expect(chapters.length).toBeGreaterThan(0);

      // Get lessons for chapters using ANY
      const chapterIds = chapters.map(c => c.id);
      const lessons = await testQuery<{ id: string; video_asset_id: string | null }>`
        SELECT id, video_asset_id FROM lessons
        WHERE chapter_id = ANY(${chapterIds})
      `;

      expect(lessons.length).toBeGreaterThan(0);
    });

    it('should update course title and description (admin PATCH)', async () => {
      const newTitle = 'Admin Updated Title';
      const newDescription = 'Admin updated description';

      const updated = await testQueryOne<Course>`
        UPDATE courses
        SET
          title = ${newTitle},
          description = ${newDescription},
          updated_at = NOW()
        WHERE id = ${TEST_IDS.courseId}
        RETURNING *
      `;

      expect(updated?.title).toBe(newTitle);
      expect(updated?.description).toBe(newDescription);

      // Restore
      await testSql`
        UPDATE courses
        SET title = 'Test Integration Course', description = 'A test course for integration tests'
        WHERE id = ${TEST_IDS.courseId}
      `;
    });
  });

  describe('8. SQL Pattern Tests', () => {
    it('should handle NULL values correctly', async () => {
      const nullValue: string | null = null;

      const updated = await testQueryOne<Lesson>`
        UPDATE lessons
        SET
          video_asset_id = COALESCE(${nullValue}, video_asset_id),
          updated_at = NOW()
        WHERE id = ${TEST_IDS.lessonId}
        RETURNING *
      `;

      expect(updated).not.toBeNull();
      // video_asset_id should remain unchanged (null in our test data)
      expect(updated?.video_asset_id).toBeNull();
    });

    it('should handle array parameters with ANY', async () => {
      const ids = [TEST_IDS.chapterId];

      const lessons = await testQuery<Lesson>`
        SELECT * FROM lessons WHERE chapter_id = ANY(${ids})
      `;

      expect(lessons.length).toBeGreaterThan(0);
    });

    it('should handle empty arrays', async () => {
      const emptyIds: string[] = [];

      // This should return no results
      const lessons = await testQuery<Lesson>`
        SELECT * FROM lessons WHERE chapter_id = ANY(${emptyIds})
      `;

      expect(lessons.length).toBe(0);
    });

    it('should handle ORDER BY and LIMIT', async () => {
      const chapters = await testQuery<Chapter>`
        SELECT * FROM chapters
        WHERE course_id = ${TEST_IDS.courseId}
        ORDER BY chapter_position ASC
        LIMIT 10
      `;

      expect(chapters.length).toBeGreaterThan(0);
      // Verify ordering
      for (let i = 1; i < chapters.length; i++) {
        expect(chapters[i].chapter_position).toBeGreaterThanOrEqual(chapters[i-1].chapter_position);
      }
    });
  });
});
