'use client';

import { useMemo } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, AlertTriangle } from 'lucide-react';
import { EditCommunityButton } from '@/components/admin/edit-community-button';
import { DeleteCommunityButton } from '@/components/admin/delete-community-button';
import { AdminDataTable } from './AdminDataTable';
import { CommunityDetailPanel } from './CommunityDetailPanel';
import { formatEur } from '@/lib/admin-platform/format';
import type { AdminCommunityRow } from '@/lib/admin-platform/communities';

export function CommunitiesTable({ communities }: { communities: AdminCommunityRow[] }) {
  const columns = useMemo<ColumnDef<AdminCommunityRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Community',
        accessorKey: 'name',
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="h-9 w-9">
                {c.imageUrl ? <AvatarImage src={c.imageUrl} alt={c.name} /> : null}
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                  {c.name[0]?.toUpperCase() ?? '?'}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0">
                <Link
                  href={`/${c.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-sm truncate hover:text-primary hover:underline"
                >
                  {c.name}
                </Link>
                {c.description ? (
                  <span className="text-xs text-muted-foreground truncate max-w-[280px]">
                    {c.description}
                  </span>
                ) : null}
              </div>
            </div>
          );
        },
      },
      {
        id: 'creator',
        header: 'Creator',
        accessorFn: (row) => row.creator.fullName ?? row.creator.email,
        cell: ({ row }) => (
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium truncate">
              {row.original.creator.fullName ?? '—'}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {row.original.creator.email}
            </span>
          </div>
        ),
      },
      {
        id: 'members',
        header: 'Members',
        accessorKey: 'membersCount',
        cell: ({ row }) => (
          <div className="inline-flex items-center gap-1.5 text-sm">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{row.original.membersCount.toLocaleString()}</span>
          </div>
        ),
      },
      {
        id: 'plan',
        header: 'Plan',
        accessorFn: (row) =>
          !row.membershipEnabled
            ? 0
            : row.stripeAccountId
            ? row.membershipPrice ?? 0
            : -1,
        cell: ({ row }) => {
          const c = row.original;
          if (!c.membershipEnabled) {
            return <span className="text-xs text-muted-foreground">Free</span>;
          }
          if (!c.stripeAccountId) {
            return (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100/60 px-2 py-0.5 rounded-full">
                <AlertTriangle className="h-3 w-3" />
                Paid · No Stripe
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded-full">
              {formatEur(c.membershipPrice ?? 0)}/mo
            </span>
          );
        },
      },
      {
        id: 'revenue',
        header: 'Revenue (lifetime)',
        accessorKey: 'totalRevenue',
        cell: ({ row }) => (
          <span className="text-sm font-medium tabular-nums">
            {formatEur(row.original.totalRevenue)}
          </span>
        ),
      },
      {
        id: 'platformFees',
        header: 'Platform fees',
        accessorKey: 'platformFees',
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-muted-foreground">
            {formatEur(row.original.platformFees)}
          </span>
        ),
      },
      {
        id: 'createdAt',
        header: 'Created',
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
        cell: ({ row }) => (
          <div className="flex gap-1 justify-end">
            <EditCommunityButton
              communityId={row.original.id}
              communityName={row.original.name}
              communityDescription={row.original.description ?? ''}
              communitySlug={row.original.slug}
            />
            <DeleteCommunityButton
              communityId={row.original.id}
              communityName={row.original.name}
            />
          </div>
        ),
      },
    ],
    []
  );

  return (
    <AdminDataTable
      columns={columns}
      data={communities}
      searchPlaceholder="Search communities by name…"
      pageSize={25}
      emptyMessage="No communities yet."
      renderSubComponent={(community) => (
        <CommunityDetailPanel
          communityId={community.id}
          slug={community.slug}
        />
      )}
    />
  );
}
