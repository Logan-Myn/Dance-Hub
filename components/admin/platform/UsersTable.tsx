'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { type ColumnDef } from '@tanstack/react-table';
import { ShieldCheck } from 'lucide-react';
import { Pill } from '@/components/ds/pill';
import { communityPath } from '@/lib/safe-redirect';
import type { AdminUserRow, AdminUserCommunity } from '@/lib/admin-platform/users';
import { AdminDataTable } from './AdminDataTable';
import { DateCell, NoneCell, PersonCell } from './cells';
import { UserActions } from './row-actions';

const nameOf = (u: AdminUserRow) => u.fullName ?? u.displayName ?? u.email;

export function UsersTable({ users }: { users: AdminUserRow[] }) {
  const columns = useMemo<ColumnDef<AdminUserRow>[]>(
    () => [
      {
        id: 'name',
        header: 'User',
        accessorFn: nameOf,
        sortingFn: 'alphanumeric',
        cell: ({ row }) => {
          const u = row.original;
          const handle = u.displayName && u.fullName && u.displayName !== u.fullName ? `@${u.displayName}` : undefined;
          return <PersonCell id={u.authUserId ?? u.id} name={nameOf(u)} sub={handle} avatarUrl={u.avatarUrl} />;
        },
      },
      {
        id: 'email',
        header: 'Email',
        accessorKey: 'email',
        cell: ({ row }) => <span className="text-ink-2">{row.original.email}</span>,
      },
      {
        id: 'role',
        header: 'Role',
        accessorFn: (row) => (row.isAdmin ? 'admin' : 'user'),
        cell: ({ row }) =>
          row.original.isAdmin ? (
            <Pill variant="brand">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Admin
            </Pill>
          ) : (
            <span className="text-ink-3">User</span>
          ),
      },
      {
        id: 'createdCommunities',
        header: 'Owns',
        accessorFn: (row) => row.createdCommunities.length,
        cell: ({ row }) => <CommunityList items={row.original.createdCommunities} />,
      },
      {
        id: 'joinedCommunities',
        header: 'Member of',
        accessorFn: (row) => row.joinedCommunities.length,
        cell: ({ row }) => <CommunityList items={row.original.joinedCommunities} />,
      },
      {
        id: 'createdAt',
        header: 'Joined',
        accessorFn: (row) => row.createdAt.getTime(),
        cell: ({ row }) => <DateCell date={row.original.createdAt} />,
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        // The admin user routes and /api/profile take the auth user id, not
        // the profile id (with the profile id, Delete matched nothing).
        cell: ({ row }) =>
          row.original.authUserId ? (
            <div className="flex justify-end">
              <UserActions userId={row.original.authUserId} name={nameOf(row.original)} />
            </div>
          ) : null,
      },
    ],
    []
  );

  return (
    <AdminDataTable
      columns={columns}
      data={users}
      searchPlaceholder="Search by name or email"
      pageSize={25}
      noun={['user', 'users']}
      emptyMessage="No users yet."
    />
  );
}

function CommunityList({ items }: { items: AdminUserCommunity[] }) {
  if (items.length === 0) return <NoneCell />;
  const visible = items.slice(0, 2);
  const overflow = items.length - visible.length;
  return (
    <div className="flex max-w-[180px] flex-col gap-0.5">
      {visible.map((c) => (
        <Link key={c.slug} href={communityPath(c.slug)} target="_blank" rel="noopener noreferrer" className="truncate text-ink hover:text-brand-ink hover:underline hover:underline-offset-[3px]">
          {c.name}
        </Link>
      ))}
      {overflow > 0 && <span className="text-[13px] text-ink-3">and {overflow} more</span>}
    </div>
  );
}
