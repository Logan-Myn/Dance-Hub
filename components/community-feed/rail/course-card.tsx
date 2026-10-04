import Link from "next/link";
import { BookOpen } from "lucide-react";
import { communityPath } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";
import { RailSection } from "./rail-section";
import type { CourseProgress } from "../types";

/** The course to pick up next, with lesson progress. */
export function CourseCard({ slug, progress, card = false }: { slug: string; progress: CourseProgress; card?: boolean }) {
  const pct = progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;
  const body = (
    <RailSection
      title={progress.started ? "Continue learning" : "Start learning"}
      link={{ href: communityPath(slug, "/classroom"), label: "Classroom" }}
    >
      <Link
        href={communityPath(slug, `/classroom/${encodeURIComponent(progress.courseSlug)}`)}
        className="-m-2.5 grid grid-cols-[48px_minmax(0,1fr)] items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-surface-2 min-[1080px]:hover:bg-surface"
      >
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-brand-ink">
          <BookOpen className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <strong className="block truncate text-[14.5px] font-semibold text-ink">{progress.courseTitle}</strong>
          <span className="block truncate text-[13px] text-ink-2">
            {progress.nextLessonTitle && progress.nextLessonNumber
              ? `Lesson ${progress.nextLessonNumber} of ${progress.total}: ${progress.nextLessonTitle}`
              : `${progress.total} ${progress.total === 1 ? "lesson" : "lessons"}`}
          </span>
          <span
            role="progressbar"
            aria-label={`${pct}% complete`}
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-3"
          >
            <span className="block h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </span>
        </span>
      </Link>
    </RailSection>
  );
  return card ? <div className={cn("flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4")}>{body}</div> : body;
}
