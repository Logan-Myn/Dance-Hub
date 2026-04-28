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
import {
  BookOpen,
  Layers,
  FileText,
  MoreVertical,
  ExternalLink,
} from 'lucide-react';
import { EditCourseButton } from '@/components/admin/edit-course-button';
import { DeleteCourseButton } from '@/components/admin/delete-course-button';
import { AdminDataTable } from './AdminDataTable';
import type { AdminCourseRow } from '@/lib/admin-platform/courses';

export function CoursesTable({ courses }: { courses: AdminCourseRow[] }) {
  const columns = useMemo<ColumnDef<AdminCourseRow>[]>(
    () => [
      {
        id: 'title',
        header: 'Course',
        accessorKey: 'title',
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="h-9 w-9 rounded-lg">
                {c.imageUrl ? (
                  <AvatarImage src={c.imageUrl} alt={c.title} />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-primary rounded-lg">
                  <BookOpen className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-sm truncate max-w-[260px]">
                  {c.title}
                </span>
                {c.description ? (
                  <span className="text-xs text-muted-foreground truncate max-w-[260px]">
                    {c.description}
                  </span>
                ) : null}
              </div>
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
        id: 'visibility',
        header: 'Visibility',
        accessorFn: (row) => (row.isPublic ? 'public' : 'private'),
        cell: ({ row }) =>
          row.original.isPublic ? (
            <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100/60 text-emerald-700">
              Public
            </span>
          ) : (
            <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              Private
            </span>
          ),
      },
      {
        id: 'chapters',
        header: 'Chapters',
        accessorKey: 'chaptersCount',
        cell: ({ row }) => (
          <div className="inline-flex items-center gap-1.5 text-sm tabular-nums">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            {row.original.chaptersCount}
          </div>
        ),
      },
      {
        id: 'lessons',
        header: 'Lessons',
        accessorKey: 'lessonsCount',
        cell: ({ row }) => (
          <div className="inline-flex items-center gap-1.5 text-sm tabular-nums">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            {row.original.lessonsCount}
          </div>
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
        cell: ({ row }) => {
          const c = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {c.community.slug ? (
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/${c.community.slug}/classroom/${c.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View course
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <EditCourseButton
                  courseId={c.id}
                  courseTitle={c.title}
                  courseDescription={c.description ?? ''}
                />
                <DeleteCourseButton courseId={c.id} courseTitle={c.title} />
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
      data={courses}
      searchPlaceholder="Search by course title, community, or description…"
      pageSize={25}
      emptyMessage="No courses yet."
    />
  );
}
