import { requirePlatformAdminPage } from '@/lib/community-auth';
import { getAllAdminUsers } from '@/lib/admin-platform/users';
import { UsersTable } from '@/components/admin/platform/UsersTable';
import { Screen, ScreenHead } from '@/components/community-admin/ui';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function UsersPage() {
  await requirePlatformAdminPage();
  const users = await getAllAdminUsers();

  return (
    <Screen>
      <ScreenHead title="Users" sub={`${users.length.toLocaleString('en-GB')} ${users.length === 1 ? 'person has an account' : 'people have an account'} on Dance-Hub.`} />
      <UsersTable users={users} />
    </Screen>
  );
}
