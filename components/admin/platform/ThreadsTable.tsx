'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { type ColumnDef } from '@tanstack/react-table';
import { Flag, MessageCircle } from 'lucide-react';
import { communityPath } from '@/lib/safe-redirect';
import type { AdminThreadRow } from '@/lib/admin-platform/threads';
import { AdminDataTable } from './AdminDataTable';
import { CountCell, DateCell, PersonCell } from './cells';
import { ThreadActions } from './row-actions';

export function ThreadsTable({ threads }: { threads: AdminThreadRow[] }) {
  const columns = useMemo<ColumnDef<AdminThreadRow>[]>(
    () => [
      {
        id: 'thread',
        header: 'Post',
        accessorFn: (row) => `${row.title} ${row.contentPreview}`,
        cell: ({ row }) => {
          const t = row.original;
          return (
            <div className="min-w-[220px] max-w-[360px]">
              <p className="truncate font-semibold text-ink">{t.title}</p>
              {t.contentPreview && <p className="line-clamp-2 text-[13px] text-ink-3">{t.contentPreview}</p>}
            </div>
          );
        },
      },
      {
        id: 'community',
        header: 'Community',
        accessorFn: (row) => row.community.name,
        cell: ({ row }) => <CommunityLink community={row.original.community} />,
      },
      {
        id: 'author',
        header: 'Author',
        accessorFn: (row) => row.author.fullName ?? row.author.email,
        cell: ({ row }) => {
          const a = row.original.author;
          return <PersonCell id={a.email} name={a.fullName ?? a.email} sub={a.fullName ? a.email : undefined} avatarUrl={a.avatarUrl} />;
        },
      },
      {
        id: 'replies',
        header: 'Replies',
        accessorKey: 'repliesCount',
        cell: ({ row }) => <CountCell icon={MessageCircle} value={row.original.repliesCount} />,
      },
      {
        id: 'reports',
        header: 'Reports',
        accessorKey: 'reportsCount',
        cell: ({ row }) => <CountCell icon={Flag} value={row.original.reportsCount} tone={row.original.reportsCount > 0 ? 'warn' : undefined} />,
      },
      {
        id: 'createdAt',
        header: 'Posted',
        accessorFn: (row) => row.createdAt.getTime(),
        cell: ({ row }) => <DateCell date={row.original.createdAt} />,
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <ThreadActions thread={{ id: row.original.id, title: row.original.title, communitySlug: row.original.community.slug || null }} />
          </div>
        ),
      },
    ],
    []
  );

  return (
    <AdminDataTable
      columns={columns}
      data={threads}
      searchPlaceholder="Search by title, text, community or author"
      pageSize={25}
      noun={['post', 'posts']}
      emptyMessage="No posts yet."
    />
  );
}

export function CommunityLink({ community }: { community: { name: string; slug: string } }) {
  if (!community.slug) return <span className="text-ink-3">{community.name}</span>;
  return (
    <Link href={communityPath(community.slug)} target="_blank" rel="noopener noreferrer" className="inline-block max-w-[180px] truncate align-middle text-ink hover:text-brand-ink hover:underline hover:underline-offset-[3px]">
      {community.name}
    </Link>
  );
}
