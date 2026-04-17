"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { XMarkIcon, ClockIcon, CalendarIcon, VideoCameraIcon, PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Link from "next/link";
import { toast } from "react-hot-toast";

interface LiveClass {
  id: string;
  title: string;
  description?: string | null;
  scheduled_start_time: string;
  duration_minutes: number;
  teacher_name: string;
  teacher_avatar_url?: string | null;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  is_currently_active: boolean;
  is_starting_soon: boolean;
}

interface LiveClassDetailsModalProps {
  liveClass: LiveClass;
  communitySlug: string;
  /** Teacher/owner-only mutations (edit, delete). */
  isTeacher?: boolean;
  onClose: () => void;
  onEdit?: (liveClass: LiveClass) => void;
  onDeleted?: () => void;
}

export default function LiveClassDetailsModal({
  liveClass,
  communitySlug,
  isTeacher = false,
  onClose,
  onEdit,
  onDeleted,
}: LiveClassDetailsModalProps) {
  const startTime = parseISO(liveClass.scheduled_start_time);
  const endTime = new Date(startTime.getTime() + liveClass.duration_minutes * 60000);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const getStatusBadge = () => {
    if (liveClass.is_currently_active) {
      return <Badge className="bg-red-500 hover:bg-red-600">🔴 LIVE NOW</Badge>;
    }
    if (liveClass.is_starting_soon) {
      return <Badge className="bg-amber-500 hover:bg-amber-600">⏰ Starting Soon</Badge>;
    }
    if (liveClass.status === 'ended') {
      return <Badge variant="secondary">Ended</Badge>;
    }
    if (liveClass.status === 'cancelled') {
      return <Badge variant="destructive">Cancelled</Badge>;
    }
    return <Badge variant="outline">Scheduled</Badge>;
  };

  const canJoin = liveClass.is_currently_active || liveClass.is_starting_soon;
  // Mutations allowed only for future / upcoming classes. Past (ended) and
  // cancelled classes are read-only.
  const canMutate = isTeacher && liveClass.status !== 'ended' && liveClass.status !== 'cancelled';

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/community/${communitySlug}/live-classes/${liveClass.id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete class');
      }
      toast.success('Class deleted');
      setConfirmDeleteOpen(false);
      onDeleted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete class');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Live Class Details</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-6 w-6 p-0"
              >
                <XMarkIcon className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">{liveClass.title}</h2>
              {getStatusBadge()}
            </div>

            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              {liveClass.teacher_avatar_url && (
                <img
                  src={liveClass.teacher_avatar_url}
                  alt={liveClass.teacher_name}
                  className="h-12 w-12 rounded-full"
                />
              )}
              <div>
                <p className="text-xs text-gray-500">Instructor</p>
                <p className="font-medium text-gray-900">{liveClass.teacher_name}</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <CalendarIcon className="h-5 w-5 text-gray-400" />
                <span>{format(startTime, 'EEEE, MMMM d, yyyy')}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <ClockIcon className="h-5 w-5 text-gray-400" />
                <span>
                  {format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')}
                </span>
                <span className="text-gray-500">({liveClass.duration_minutes} minutes)</span>
              </div>
            </div>

            {liveClass.description && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Description</h3>
                <p className="text-sm text-gray-600">{liveClass.description}</p>
              </div>
            )}

            {/* Teacher/owner actions */}
            {canMutate && (
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => onEdit?.(liveClass)}
                  className="flex-1"
                >
                  <PencilSquareIcon className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="flex-1 text-red-600 hover:text-red-700 hover:border-red-300"
                >
                  <TrashIcon className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            )}

            {/* Primary action */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                Close
              </Button>
              {canJoin && (
                <Link href={`/live-class/${liveClass.id}`} className="flex-1">
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 flex items-center gap-2">
                    <VideoCameraIcon className="h-5 w-5" />
                    {liveClass.is_currently_active ? 'Join Now' : 'Join Soon'}
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this live class?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{liveClass.title}&rdquo; will be removed from the calendar.
              This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
