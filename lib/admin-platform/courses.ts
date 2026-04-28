import { query } from '@/lib/db';

export interface AdminCourseRow {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  isPublic: boolean;
  createdAt: Date;
  community: {
    name: string;
    slug: string;
  };
  chaptersCount: number;
  lessonsCount: number;
}

interface CourseRow {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  is_public: boolean | null;
  created_at: Date;
  community_id: string;
  community_name: string;
  community_slug: string;
}

interface ChapterRow {
  course_id: string;
  id: string;
}

interface LessonCountRow {
  chapter_id: string;
  count: number;
}

/**
 * All courses with their parent community, plus aggregate chapter and
 * lesson counts. Three queries (courses + chapters + lessons) instead of
 * N to avoid the original page's per-course follow-up calls.
 */
export async function getAllAdminCourses(): Promise<AdminCourseRow[]> {
  const courses = await query<CourseRow>`
    SELECT c.id, c.title, c.slug, c.description, c.image_url, c.is_public,
           c.created_at, c.community_id,
           com.name AS community_name,
           com.slug AS community_slug
    FROM courses c
    LEFT JOIN communities com ON com.id = c.community_id
    ORDER BY c.created_at DESC
  `;
  if (courses.length === 0) return [];

  const courseIds = courses.map((c) => c.id);
  const chapters = await query<ChapterRow>`
    SELECT course_id, id
    FROM chapters
    WHERE course_id = ANY(${courseIds})
  `;

  // Group chapter ids by course so we can sum lesson counts later.
  const chaptersByCourse = new Map<string, string[]>();
  for (const ch of chapters) {
    const list = chaptersByCourse.get(ch.course_id) ?? [];
    list.push(ch.id);
    chaptersByCourse.set(ch.course_id, list);
  }

  const chapterIds = chapters.map((c) => c.id);
  const lessonCounts =
    chapterIds.length > 0
      ? await query<LessonCountRow>`
          SELECT chapter_id, COUNT(*)::int AS count
          FROM lessons
          WHERE chapter_id = ANY(${chapterIds})
          GROUP BY chapter_id
        `
      : [];
  const lessonCountByChapter = new Map(
    lessonCounts.map((l) => [l.chapter_id, l.count])
  );

  return courses.map((c) => {
    const chapterList = chaptersByCourse.get(c.id) ?? [];
    const lessonsCount = chapterList.reduce(
      (sum, chapterId) => sum + (lessonCountByChapter.get(chapterId) ?? 0),
      0
    );
    return {
      id: c.id,
      title: c.title,
      slug: c.slug,
      description: c.description,
      imageUrl: c.image_url,
      isPublic: c.is_public ?? true,
      createdAt: new Date(c.created_at),
      community: {
        name: c.community_name ?? 'Unknown',
        slug: c.community_slug ?? '',
      },
      chaptersCount: chapterList.length,
      lessonsCount,
    };
  });
}
