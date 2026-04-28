'use client';

import { useMemo } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MessageCircle, Flag, MoreVertical, ExternalLink } from 'lucide-react';
import { DeleteThreadButton } from '@/components/admin/delete-thread-button';
import { AdminDataTable } from './AdminDataTable';
import type { AdminThreadRow } from '@/lib/admin-platform/threads';

export function ThreadsTable({ threads }: { threads: AdminThreadRow[] }) {
  const columns = useMemo<ColumnDef<AdminThreadRow>[]>(
    () => [
      {
        id: 'thread',
        header: 'Thread',
        accessorFn: (row) => `${row.title} ${row.contentPreview}`,
        cell: ({ row }) => {
          const t = row.original;
          return (
            <div className="max-w-[360px] min-w-0 space-y-0.5">
              <p className="font-medium text-sm truncate">{t.title}</p>
              {t.contentPreview ? (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {t.contentPreview}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'community',
        header: 'Community',
        accessorFn: (row) => row.community.name,
        cell: ({ row }) => {
          const c = row.original.community;
          if (!c.slug) {
            return <span className="text-xs text-muted-foreground">{c.name}</span>;
          }
          return (
            <Link
              href={`/${c.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm hover:text-primary hover:underline truncate inline-block max-w-[160px]"
            >
              {c.name}
            </Link>
          );
        },
      },
      {
        id: 'author',
        header: 'Author',
        accessorFn: (row) => row.author.fullName ?? row.author.email,
        cell: ({ row }) => {
          const a = row.original.author;
          const initial =
            (a.fullName ?? a.email)[0]?.toUpperCase() ?? '?';
          return (
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="h-7 w-7">
                {a.avatarUrl ? (
                  <AvatarImage src={a.avatarUrl} alt={a.fullName ?? ''} />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium truncate">
                  {a.fullName ?? '—'}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {a.email}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'replies',
        header: 'Replies',
        accessorKey: 'repliesCount',
        cell: ({ row }) => (
          <div className="inline-flex items-center gap-1.5 text-sm tabular-nums">
            <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
            {row.original.repliesCount}
          </div>
        ),
      },
      {
        id: 'reports',
        header: 'Reports',
        accessorKey: 'reportsCount',
        cell: ({ row }) => {
          const n = row.original.reportsCount;
          return (
            <div
              className={`inline-flex items-center gap-1.5 text-sm tabular-nums ${
                n > 0 ? 'text-amber-700 font-medium' : 'text-muted-foreground'
              }`}
            >
              <Flag
                className={`h-3.5 w-3.5 ${n > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}
              />
              {n}
            </div>
          );
        },
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
        cell: ({ row }) => {
          const t = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {t.community.slug ? (
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/${t.community.slug}?thread=${t.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View thread
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <DeleteThreadButton threadId={t.id} threadTitle={t.title} />
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    []
  );

  return (
    <AdminDataTable
      columns={columns}
      data={threads}
      searchPlaceholder="Search by title, content, community, or author…"
      pageSize={25}
      emptyMessage="No threads yet."
    />
  );
}
