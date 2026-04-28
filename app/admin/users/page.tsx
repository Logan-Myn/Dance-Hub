import { getAllAdminUsers } from '@/lib/admin-platform/users';
import { UsersTable } from '@/components/admin/platform/UsersTable';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function UsersPage() {
  const users = await getAllAdminUsers();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500 space-y-8">
      <header>
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">
          Users
        </h1>
        <p className="text-muted-foreground mt-2">
          {users.length.toLocaleString()} {users.length === 1 ? 'user' : 'users'} on the platform.
        </p>
      </header>

      <UsersTable users={users} />
    </div>
  );
}
