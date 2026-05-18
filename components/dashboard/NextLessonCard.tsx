"use client";

import Link from "next/link";
import { Calendar, Clock, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LessonBookingWithDetails } from "@/types/private-lessons";

interface NextLessonCardProps {
  booking: LessonBookingWithDetails;
  canJoinVideo: boolean;
  timeUntil: string | null;
  formattedDate: string;
}

export function NextLessonCard({
  booking,
  canJoinVideo,
  timeUntil,
  formattedDate,
}: NextLessonCardProps) {
  return (
    <section className="rounded-2xl p-4 sm:p-5 bg-primary/5 border border-primary/15">
      <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-wider text-primary font-medium">
        <span>Next Lesson</span>
        {timeUntil && (
          <>
            <span aria-hidden>·</span>
            <span className="text-muted-foreground normal-case font-normal tracking-normal">
              {timeUntil}
            </span>
          </>
        )}
      </div>

      <Link
        href={`/${booking.community_slug}/private-lessons`}
        className="inline-block hover:underline"
      >
        <h2 className="font-display text-lg sm:text-xl font-semibold text-foreground">
          {booking.lesson_title}
        </h2>
      </Link>

      <p className="text-sm text-muted-foreground mt-1 mb-3">
        {booking.community_name}
      </p>

      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4 flex-wrap">
        <span className="flex items-center gap-1.5">
          <Calendar className="h-4 w-4" />
          {formattedDate}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-4 w-4" />
          {booking.duration_minutes} min
        </span>
      </div>

      {canJoinVideo ? (
        <Button asChild className="rounded-xl">
          <Link href={`/video-session/${booking.id}`} className="flex items-center gap-2">
            <Video className="h-4 w-4" />
            Join Video
          </Link>
        </Button>
      ) : (
        <Button disabled variant="secondary" className="rounded-xl">
          <Clock className="h-4 w-4 mr-2" />
          Opens soon
        </Button>
      )}
    </section>
  );
}
