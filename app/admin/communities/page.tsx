import { requirePlatformAdminPage } from '@/lib/community-auth';
import { getAllAdminCommunities } from '@/lib/admin-platform/communities';
import { CommunitiesTable } from '@/components/admin/platform/CommunitiesTable';
import { Screen, ScreenHead } from '@/components/community-admin/ui';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function CommunitiesPage() {
  await requirePlatformAdminPage();
  const communities = await getAllAdminCommunities();

  return (
    <Screen>
      <ScreenHead title="Communities" sub={`${communities.length.toLocaleString('en-GB')} ${communities.length === 1 ? 'community' : 'communities'} on Dance-Hub.`} />
      <CommunitiesTable communities={communities} />
    </Screen>
  );
}
