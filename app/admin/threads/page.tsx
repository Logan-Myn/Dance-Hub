import { requirePlatformAdminPage } from '@/lib/community-auth';
import { getAllAdminThreads } from '@/lib/admin-platform/threads';
import { ThreadsTable } from '@/components/admin/platform/ThreadsTable';
import { Screen, ScreenHead } from '@/components/community-admin/ui';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function ThreadsPage() {
  await requirePlatformAdminPage();
  const threads = await getAllAdminThreads();

  return (
    <Screen>
      <ScreenHead title="Posts" sub={`${threads.length.toLocaleString('en-GB')} ${threads.length === 1 ? 'post' : 'posts'} across all communities.`} />
      <ThreadsTable threads={threads} />
    </Screen>
  );
}
