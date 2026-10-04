import Link from "next/link";
import { CheckCircle2, Layers, Lock, Users, Video } from "lucide-react";
import type { ClassroomCourse } from "@/lib/classroom/data";
import { communityPath } from "@/lib/safe-redirect";
import { CourseCover, ProgressBar } from "./course-cover";

export function CourseCard({ slug, course, canManage, memberCount }: { slug: string; course: ClassroomCourse; canManage: boolean; memberCount: number }) {
  const href = communityPath(slug, `/classroom/${encodeURIComponent(course.slug)}`);
  const pct = course.lessonCount ? (course.completedCount / course.lessonCount) * 100 : 0;
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-raised has-[a.course-link:focus-visible]:outline has-[a.course-link:focus-visible]:outline-2 has-[a.course-link:focus-visible]:outline-offset-2 has-[a.course-link:focus-visible]:outline-brand">
      <div className="relative aspect-[3/2] overflow-hidden bg-surface-2">
        <CourseCover id={course.id} title={course.title} coverUrl={course.coverUrl} caption={`${course.lessonCount} ${course.lessonCount === 1 ? "lesson" : "lessons"}`} />
        {!course.isPublic && (
          <div className="absolute left-3 top-3 z-[2] flex gap-1.5">
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-surface px-2.5 text-[12px] font-bold text-ink-2 shadow-card">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Private draft
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 px-[18px] pb-[18px] pt-4">
        <h3 className="font-display text-[18px] font-semibold leading-[1.25] text-ink group-hover:text-brand-ink">
          <Link href={href} className="course-link outline-none after:absolute after:inset-0 after:z-[1] after:content-['']">
            {course.title}
          </Link>
        </h3>
        {course.description && <p className="line-clamp-2 text-[14.5px] text-ink-2">{course.description}</p>}
        <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[13px] text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            {course.chapterCount} {course.chapterCount === 1 ? "chapter" : "chapters"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Video className="h-3.5 w-3.5" aria-hidden="true" />
            {course.lessonCount} {course.lessonCount === 1 ? "lesson" : "lessons"}
          </span>
        </div>
        <div className="mt-auto flex flex-col gap-2 pt-2.5">
          {canManage ? (
            course.isPublic ? (
              <div className="flex items-center gap-2 text-[13px] text-ink-2">
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  <strong className="font-semibold text-ink">{course.started ?? 0}</strong> of {memberCount} members started, {course.finished ?? 0} finished
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[13px] text-ink-2">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                Only you can see this draft
              </div>
            )
          ) : course.status === "done" ? (
            <>
              <div className="flex items-center justify-between gap-2 text-[13px] tabular-nums text-ink-2">
                <span className="inline-flex items-center gap-1.5 font-bold text-ok">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Completed
                </span>
                <span>
                  {course.lessonCount} of {course.lessonCount}
                </span>
              </div>
              <ProgressBar value={100} done />
            </>
          ) : course.status === "progress" ? (
            <>
              <div className="flex items-center justify-between gap-2 text-[13px] tabular-nums text-ink-2">
                <span>
                  <strong className="font-semibold text-ink">
                    {course.completedCount} of {course.lessonCount}
                  </strong>{" "}
                  lessons done
                </span>
                <span>{Math.round(pct)}%</span>
              </div>
              <ProgressBar value={pct} />
            </>
          ) : (
            <div className="flex items-center justify-between gap-2 text-[13px] text-ink-2">
              <span>Not started</span>
              <span className="font-semibold text-brand-ink">Start course</span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
