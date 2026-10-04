import Link from "next/link";
import { BookOpen, Play } from "lucide-react";
import type { ClassroomCourse } from "@/lib/classroom/data";
import { communityPath } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/community-feed/feed-header";
import { CourseCover, ProgressBar } from "./course-cover";

const BTN_LG = "h-11 px-[18px] text-[15px]";

/** The course in progress (or the newest one not started) with a resume button. */
export function ContinueCard({ slug, course }: { slug: string; course: ClassroomCourse }) {
  const started = course.status === "progress";
  const base = communityPath(slug, `/classroom/${encodeURIComponent(course.slug)}`);
  const resume = course.next ? `${base}?lesson=${course.next.id}` : base;
  return (
    <section
      aria-labelledby="continue-title"
      className="mt-6 grid grid-cols-1 items-center gap-4 rounded-[20px] border border-line bg-surface p-4 shadow-raised sm:grid-cols-[240px_minmax(0,1fr)] sm:gap-6 sm:pr-6"
    >
      <Link href={resume} tabIndex={-1} aria-hidden="true" className="relative aspect-video overflow-hidden rounded-xl sm:aspect-[3/2]">
        <CourseCover id={course.id} title={course.title} coverUrl={course.coverUrl} />
      </Link>
      <div className="flex min-w-0 flex-col gap-2.5">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
          {started ? <Play className="h-4 w-4" aria-hidden="true" /> : <BookOpen className="h-4 w-4" aria-hidden="true" />}
          {started ? "Continue where you left off" : "Start your first course"}
        </span>
        <h2 id="continue-title" className="text-balance font-display text-[22px] font-semibold leading-[1.15] text-ink sm:text-[24px]">
          {course.title}
        </h2>
        {course.next && (
          <p className="text-[15px] text-ink-2">
            Next: <strong className="font-semibold text-ink">{course.next.title}</strong>. {course.next.chapterTitle}, lesson{" "}
            {course.next.number} of {course.lessonCount}.
          </p>
        )}
        <div className="flex items-center gap-3 text-[13.5px] tabular-nums text-ink-2">
          <ProgressBar value={course.lessonCount ? (course.completedCount / course.lessonCount) * 100 : 0} className="max-w-[360px] flex-1" />
          <span>
            {course.completedCount} of {course.lessonCount} done
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-2">
          <Link href={resume} className={cn(BTN_PRIMARY, BTN_LG)}>
            <Play className="!h-4 !w-4" aria-hidden="true" />
            {started ? "Resume lesson" : "Start course"}
          </Link>
          <Link href={base} className={cn(BTN_SECONDARY, BTN_LG)}>
            See all lessons
          </Link>
        </div>
      </div>
    </section>
  );
}
