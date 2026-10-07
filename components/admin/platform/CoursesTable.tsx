'use client';

import { useMemo } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { FileText, Layers } from 'lucide-react';
import { Pill } from '@/components/ds/pill';
import type { AdminCourseRow } from '@/lib/admin-platform/courses';
import { AdminDataTable } from './AdminDataTable';
import { CountCell, DateCell, NameCell, Thumb } from './cells';
import { CourseActions } from './row-actions';
import { CommunityLink } from './ThreadsTable';

export function CoursesTable({ courses }: { courses: AdminCourseRow[] }) {
  const columns = useMemo<ColumnDef<AdminCourseRow>[]>(
    () => [
      {
        id: 'title',
        header: 'Course',
        accessorKey: 'title',
        cell: ({ row }) => {
          const c = row.original;
          return <NameCell title={c.title} sub={c.description || undefined} picture={<Thumb name={c.title} imageUrl={c.imageUrl} />} />;
        },
      },
      {
        id: 'community',
        header: 'Community',
        accessorFn: (row) => row.community.name,
        cell: ({ row }) => <CommunityLink community={row.original.community} />,
      },
      {
        id: 'visibility',
        header: 'Visibility',
        accessorFn: (row) => (row.isPublic ? 'public' : 'private'),
        cell: ({ row }) => (row.original.isPublic ? <Pill variant="ok">Public</Pill> : <Pill>Private</Pill>),
      },
      {
        id: 'chapters',
        header: 'Chapters',
        accessorKey: 'chaptersCount',
        cell: ({ row }) => <CountCell icon={Layers} value={row.original.chaptersCount} />,
      },
      {
        id: 'lessons',
        header: 'Lessons',
        accessorKey: 'lessonsCount',
        cell: ({ row }) => <CountCell icon={FileText} value={row.original.lessonsCount} />,
      },
      {
        id: 'createdAt',
        header: 'Created',
        accessorFn: (row) => row.createdAt.getTime(),
        cell: ({ row }) => <DateCell date={row.original.createdAt} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex justify-end">
              <CourseActions course={{ id: c.id, title: c.title, slug: c.slug, description: c.description, communitySlug: c.community.slug || null }} />
            </div>
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
      searchPlaceholder="Search by title or community"
      pageSize={25}
      noun={['course', 'courses']}
      emptyMessage="No courses yet."
    />
  );
}
