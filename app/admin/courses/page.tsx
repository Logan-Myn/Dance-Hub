import { requirePlatformAdminPage } from '@/lib/community-auth';
import { getAllAdminCourses } from '@/lib/admin-platform/courses';
import { CoursesTable } from '@/components/admin/platform/CoursesTable';
import { Screen, ScreenHead } from '@/components/community-admin/ui';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function CoursesPage() {
  await requirePlatformAdminPage();
  const courses = await getAllAdminCourses();

  return (
    <Screen>
      <ScreenHead title="Courses" sub={`${courses.length.toLocaleString('en-GB')} ${courses.length === 1 ? 'course' : 'courses'} across all communities.`} />
      <CoursesTable courses={courses} />
    </Screen>
  );
}
