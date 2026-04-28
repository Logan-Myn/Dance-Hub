'use client';

import { useMemo } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ShieldCheck } from 'lucide-react';
import DeleteUserButton from '@/components/admin/delete-user-button';
import { AdminDataTable } from './AdminDataTable';
import type { AdminUserRow, AdminUserCommunity } from '@/lib/admin-platform/users';

export function UsersTable({ users }: { users: AdminUserRow[] }) {
  const columns = useMemo<ColumnDef<AdminUserRow>[]>(
    () => [
      {
        id: 'name',
        header: 'User',
        accessorFn: (row) => row.fullName ?? row.displayName ?? row.email,
        cell: ({ row }) => {
          const u = row.original;
          const initial = (u.fullName ?? u.displayName ?? u.email)[0]?.toUpperCase() ?? '?';
          return (
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                {u.avatarUrl ? <AvatarImage src={u.avatarUrl} alt={u.fullName ?? ''} /> : null}
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-sm truncate">
                  {u.fullName ?? u.displayName ?? '—'}
                </span>
                {u.displayName && u.fullName && u.displayName !== u.fullName ? (
                  <span className="text-xs text-muted-foreground truncate">
                    @{u.displayName}
                  </span>
                ) : null}
              </div>
            </div>
          );
        },
        sortingFn: 'alphanumeric',
      },
      {
        id: 'email',
        header: 'Email',
        accessorKey: 'email',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.email}</span>
        ),
      },
      {
        id: 'role',
        header: 'Role',
        accessorFn: (row) => (row.isAdmin ? 'admin' : 'user'),
        cell: ({ row }) =>
          row.original.isAdmin ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100/70 text-amber-700">
              <ShieldCheck className="h-3 w-3" />
              Admin
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">User</span>
          ),
      },
      {
        id: 'createdCommunities',
        header: 'Owns',
        accessorFn: (row) => row.createdCommunities.length,
        enableSorting: true,
        cell: ({ row }) => <CommunityList items={row.original.createdCommunities} />,
      },
      {
        id: 'joinedCommunities',
        header: 'Member of',
        accessorFn: (row) => row.joinedCommunities.length,
        enableSorting: true,
        cell: ({ row }) => <CommunityList items={row.original.joinedCommunities} />,
      },
      {
        id: 'createdAt',
        header: 'Joined',
        accessorFn: (row) => row.createdAt.getTime(),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {row.original.createdAt.toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => <DeleteUserButton userId={row.original.id} />,
      },
    ],
    []
  );

  return (
    <AdminDataTable
      columns={columns}
      data={users}
      searchPlaceholder="Search users by name, email, or handle…"
      pageSize={25}
      emptyMessage="No users found."
    />
  );
}

function CommunityList({ items }: { items: AdminUserCommunity[] }) {
  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const visible = items.slice(0, 2);
  const overflow = items.length - visible.length;
  return (
    <div className="flex flex-col gap-0.5 max-w-[180px]">
      {visible.map((c) => (
        <Link
          key={c.slug}
          href={`/${c.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm truncate hover:text-primary hover:underline"
        >
          {c.name}
        </Link>
      ))}
      {overflow > 0 ? (
        <span className="text-xs text-muted-foreground">+{overflow} more</span>
      ) : null}
    </div>
  );
}
