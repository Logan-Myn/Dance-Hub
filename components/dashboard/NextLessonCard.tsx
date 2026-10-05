"use client";

import Link from "next/link";
import { Clock, Video } from "lucide-react";
import { BTN_GHOST, BTN_PRIMARY } from "@/components/community-feed/feed-header";
import { DateTile } from "@/components/ds/date-tile";
import type { LessonBookingWithDetails } from "@/types/private-lessons";
import { cn } from "@/lib/utils";

interface NextLessonCardProps {
  booking: LessonBookingWithDetails;
  canJoinVideo: boolean;
  timeUntil: string | null;
  formattedDate: string;
  timeZone: string;
  onCancel?: () => void;
}

/** The viewer's next private lesson, as a student or as the teacher. */
export function NextLessonCard({ booking, canJoinVideo, timeUntil, formattedDate, timeZone, onCancel }: NextLessonCardProps) {
  return (
    <section aria-labelledby="next-lesson" className="flex flex-wrap items-center gap-4 rounded-2xl border border-brand-line bg-surface p-4 shadow-card sm:flex-nowrap sm:p-5">
      {booking.scheduled_at && (
        <div className="hidden shrink-0 sm:block">
          <DateTile date={booking.scheduled_at} timeZone={timeZone} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-brand-ink">
          Next lesson{timeUntil ? <span className="font-medium text-ink-3">, {timeUntil}</span> : null}
        </p>
        <h2 id="next-lesson" className="mt-0.5 font-display text-[19px] font-semibold leading-snug text-ink">
          <Link href={`/${booking.community_slug}/private-lessons`} className="hover:text-brand-ink">
            {booking.lesson_title}
          </Link>
        </h2>
        <p className="mt-0.5 text-[14px] text-ink-2">
          {formattedDate}, {booking.duration_minutes} min.{" "}
          {booking.viewer_role === "teacher" ? `With ${booking.student_name || booking.student_email}` : booking.community_name}
        </p>
      </div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
        {canJoinVideo ? (
          <Link href={`/video-session/${booking.id}`} className={BTN_PRIMARY}>
            <Video aria-hidden="true" />
            Join lesson
          </Link>
        ) : (
          <span className={cn(BTN_GHOST, "pointer-events-none bg-surface-2 text-ink-3")}>
            <Clock aria-hidden="true" />
            Opens 15 min before
          </span>
        )}
        {onCancel && (
          <button type="button" onClick={onCancel} className={BTN_GHOST}>
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}
