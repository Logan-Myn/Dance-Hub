"use client";

import React from 'react';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Mail } from 'lucide-react';
import { formatInTz } from '@/lib/timezone';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import type { LessonBookingWithDetails } from '@/types/private-lessons';

interface BookingRowProps {
  booking: LessonBookingWithDetails;
  canJoinVideo: boolean;
  onOpen: () => void;
  onCancel: () => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function BookingRow({
  booking,
  canJoinVideo,
  onOpen,
  onCancel,
}: BookingRowProps) {
  const tz = useUserTimezone();
  const displayName = booking.student_name || booking.student_email || 'Student';

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
      <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
        {initials(displayName)}
      </div>

      <button
        type="button"
        aria-label="Open booking details"
        onClick={onOpen}
        className="flex-1 text-left min-w-0"
      >
        <div className="text-sm font-medium truncate">
          {displayName} · {booking.lesson_title}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {booking.scheduled_at
            ? formatInTz(new Date(booking.scheduled_at), tz, 'EEE, MMM d · h:mm a')
            : 'No time set'}
        </div>
      </button>

      <div className="flex items-center gap-2 flex-shrink-0">
        {canJoinVideo && booking.daily_room_name ? (
          <Button asChild size="sm" className="rounded-xl">
            <Link href={`/video-session/${booking.id}`}>Join</Link>
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="More actions"
            className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center"
          >
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onOpen}>View details</DropdownMenuItem>
            {booking.student_email && (
              <DropdownMenuItem asChild>
                <a href={`mailto:${booking.student_email}`}>
                  <Mail className="h-3.5 w-3.5 mr-2" /> Contact student
                </a>
              </DropdownMenuItem>
            )}
            {(booking.lesson_status === 'booked' ||
              booking.lesson_status === 'scheduled') && (
              <DropdownMenuItem
                onClick={onCancel}
                className="text-destructive focus:text-destructive"
              >
                Cancel booking
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
