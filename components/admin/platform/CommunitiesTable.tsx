'use client';

import { useMemo } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Users } from 'lucide-react';
import { Pill } from '@/components/ds/pill';
import { formatEur } from '@/lib/admin-platform/format';
import type { AdminCommunityRow } from '@/lib/admin-platform/communities';
import { AdminDataTable } from './AdminDataTable';
import { CountCell, DateCell, NameCell, Thumb } from './cells';
import { CommunityDetailPanel } from './CommunityDetailPanel';
import { CommunityActions } from './row-actions';

export function CommunitiesTable({ communities }: { communities: AdminCommunityRow[] }) {
  const columns = useMemo<ColumnDef<AdminCommunityRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Community',
        accessorKey: 'name',
        cell: ({ row }) => {
          const c = row.original;
          return <NameCell title={c.name} sub={c.description || `/${c.slug}`} picture={<Thumb name={c.name} imageUrl={c.imageUrl} />} width="max-w-[210px]" />;
        },
      },
      {
        id: 'creator',
        header: 'Owner',
        accessorFn: (row) => row.creator.fullName ?? row.creator.email,
        cell: ({ row }) => <NameCell title={row.original.creator.fullName ?? row.original.creator.email} sub={row.original.creator.fullName ? row.original.creator.email : undefined} width="max-w-[190px]" />,
      },
      {
        id: 'members',
        header: 'Members',
        accessorKey: 'membersCount',
        cell: ({ row }) => <CountCell icon={Users} value={row.original.membersCount} />,
      },
      {
        id: 'plan',
        header: 'Plan',
        accessorFn: (row) => (!row.membershipEnabled ? 0 : row.stripeAccountId ? row.membershipPrice ?? 0 : -1),
        cell: ({ row }) => {
          const c = row.original;
          if (!c.membershipEnabled) return <Pill>Free</Pill>;
          if (!c.stripeAccountId) return <Pill variant="warn">Paid, no payouts</Pill>;
          return <Pill variant="ok">{formatEur(c.membershipPrice ?? 0)} a month</Pill>;
        },
      },
      {
        id: 'revenue',
        header: 'Revenue',
        accessorKey: 'totalRevenue',
        cell: ({ row }) => <span className="font-semibold tabular-nums">{formatEur(row.original.totalRevenue)}</span>,
      },
      {
        id: 'platformFees',
        header: 'Fees',
        accessorKey: 'platformFees',
        cell: ({ row }) => <span className="tabular-nums text-ink-2">{formatEur(row.original.platformFees)}</span>,
      },
      {
        id: 'createdAt',
        header: 'Created',
        accessorFn: (row) => row.createdAt.getTime(),
        cell: ({ row }) => <DateCell date={row.original.createdAt} />,
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <CommunityActions community={row.original} />
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
      searchPlaceholder="Search communities"
      pageSize={25}
      noun={['community', 'communities']}
      emptyMessage="No communities yet."
      rowLabel={(c) => c.name}
      renderSubComponent={(community) => <CommunityDetailPanel communityId={community.id} slug={community.slug} />}
    />
  );
}
