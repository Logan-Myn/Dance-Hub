import { getAllAdminCourses } from '@/lib/admin-platform/courses';
import { CoursesTable } from '@/components/admin/platform/CoursesTable';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function CoursesPage() {
  const courses = await getAllAdminCourses();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500 space-y-8">
      <header>
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">
          Courses
        </h1>
        <p className="text-muted-foreground mt-2">
          {courses.length.toLocaleString()}{' '}
          {courses.length === 1 ? 'course' : 'courses'} across all communities.
        </p>
      </header>

      <CoursesTable courses={courses} />
    </div>
  );
}
