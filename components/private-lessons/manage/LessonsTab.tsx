"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'react-hot-toast';
import CreatePrivateLessonModal from '@/components/CreatePrivateLessonModal';
import { LessonCard } from './LessonCard';
import type { PrivateLesson } from '@/types/private-lessons';

interface LessonsTabProps {
  communityId: string;
  communitySlug: string;
  /** Called after any change to the lesson set so the parent page can refresh
   *  its own grid. */
  onLessonsChanged?: () => void;
}

export function LessonsTab({
  communityId: _communityId,
  communitySlug,
  onLessonsChanged,
}: LessonsTabProps) {
  const [lessons, setLessons] = useState<PrivateLesson[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PrivateLesson | null>(null);

  const [toDelete, setToDelete] = useState<PrivateLesson | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchLessons = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/community/${communitySlug}/private-lessons?include_inactive=true`,
      );
      if (res.ok) {
        const data = await res.json();
        setLessons(Array.isArray(data) ? data : data.lessons ?? []);
      }
    } catch (e) {
      console.error('Failed to load lessons', e);
    } finally {
      setIsLoading(false);
    }
  }, [communitySlug]);

  useEffect(() => {
    fetchLessons();
  }, [fetchLessons]);

  const handleToggleActive = useCallback(
    async (lesson: PrivateLesson) => {
      try {
        const res = await fetch(
          `/api/community/${communitySlug}/private-lessons/${lesson.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: !lesson.is_active }),
          },
        );
        if (!res.ok) throw new Error();
        toast.success(lesson.is_active ? 'Lesson deactivated' : 'Lesson activated');
        await fetchLessons();
        onLessonsChanged?.();
      } catch {
        toast.error('Failed to update lesson');
      }
    },
    [communitySlug, fetchLessons, onLessonsChanged],
  );

  const handleDelete = useCallback(async () => {
    if (!toDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/community/${communitySlug}/private-lessons/${toDelete.id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error();
      toast.success('Lesson deleted');
      setToDelete(null);
      await fetchLessons();
      onLessonsChanged?.();
    } catch {
      toast.error('Failed to delete lesson');
    } finally {
      setIsDeleting(false);
    }
  }, [toDelete, communitySlug, fetchLessons, onLessonsChanged]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {lessons.map(lesson => (
          <LessonCard
            key={lesson.id}
            lesson={lesson}
            onEdit={() => {
              setEditing(lesson);
              setEditorOpen(true);
            }}
            onToggleActive={() => handleToggleActive(lesson)}
            onDelete={() => setToDelete(lesson)}
          />
        ))}
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setEditorOpen(true);
          }}
          className="rounded-2xl border-2 border-dashed border-border/60 hover:border-border p-4 min-h-[140px] flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-5 w-5" />
          <span className="text-sm font-medium">New lesson</span>
        </button>
      </div>

      <CreatePrivateLessonModal
        isOpen={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        communitySlug={communitySlug}
        editingLesson={editing}
        onSuccess={() => {
          setEditorOpen(false);
          setEditing(null);
          fetchLessons();
          onLessonsChanged?.();
        }}
      />

      <AlertDialog open={!!toDelete} onOpenChange={open => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lesson?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.title} will be permanently removed. Past bookings stay intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
