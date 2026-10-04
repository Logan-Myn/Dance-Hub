"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, CalendarDays, CheckCircle2, Plus, Trophy } from "lucide-react";
import toast from "react-hot-toast";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/community-feed/feed-header";
import { FeedEmpty } from "@/components/community-feed/feed-states";
import { ContinueCard } from "@/components/community-classroom/continue-card";
import { CourseCard } from "@/components/community-classroom/course-card";
import { CreateCourseDialog } from "@/components/community-classroom/create-course-dialog";
import { ReplaysRow } from "@/components/community-classroom/replays-row";
import { SearchPalette, type PaletteItem } from "@/components/ds/search-palette";
import { useViewerTimeZone } from "@/hooks/use-viewer-time-zone";
import type { ClassroomOverview } from "@/lib/classroom/data";
import { searchLessons, type LessonSearchItem } from "@/lib/classroom/model";
import { registerPageSearch } from "@/lib/feed/search-slot";
import { communityPath } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";

type Filter = "all" | "progress" | "new" | "done" | "draft";

interface Props {
  communitySlug: string;
  teacherName: string;
  canManage: boolean;
  isCreator: boolean;
  overview: ClassroomOverview;
  memberCount: number;
  liveClassesOn: boolean;
  viewerTimeZone: string | null;
}

export default function ClassroomPageClient({
  communitySlug: slug,
  teacherName,
  canManage,
  isCreator,
  overview,
  memberCount,
  liveClassesOn,
  viewerTimeZone,
}: Props) {
  const router = useRouter();
  const timeZone = useViewerTimeZone(viewerTimeZone);
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { courses, replays, lessons } = overview;

  useEffect(() => registerPageSearch(() => setSearchOpen(true), "Search lessons"), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      setSearchOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const published = courses.filter((c) => c.isPublic);
  const continueCourse = canManage
    ? null
    : courses.find((c) => c.status === "progress") ?? courses.find((c) => c.status === "new" && c.lessonCount > 0);

  const counts: Record<Filter, number> = {
    all: courses.length,
    progress: courses.filter((c) => c.status === "progress").length,
    new: courses.filter((c) => c.status === "new").length,
    done: courses.filter((c) => c.status === "done").length,
    draft: courses.filter((c) => !c.isPublic).length,
  };
  const filters: Array<[Filter, string]> = canManage
    ? [["all", "All courses"], ["draft", "Drafts"]]
    : [["all", "All courses"], ["progress", "In progress"], ["new", "Not started"], ["done", "Completed"]];
  const list =
    filter === "all" ? courses : filter === "draft" ? courses.filter((c) => !c.isPublic) : courses.filter((c) => c.status === filter);

  const createCourse = async ({ title, description, image }: { title: string; description: string; image: File | null }) => {
    const form = new FormData();
    form.append("title", title);
    form.append("description", description);
    if (image) form.append("image", image);
    form.append("is_public", "false");
    const response = await fetch(`/api/community/${encodeURIComponent(slug)}/courses`, { method: "POST", body: form });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      toast.error(data?.error || "Couldn't create the course. Try again.");
      throw new Error("create failed");
    }
    const created = await response.json();
    toast.success("Course created");
    router.push(communityPath(slug, `/classroom/${encodeURIComponent(created.slug)}`));
  };

  type LessonItem = PaletteItem & { lesson: LessonSearchItem };
  const toItem = (l: LessonSearchItem): LessonItem => ({
    id: l.id,
    title: l.title,
    subtitle: `${l.courseTitle}, ${l.chapterTitle}${l.notes ? `: ${l.notes.slice(0, 90)}` : ""}`,
    leading: (
      <span className={cn("grid h-7 w-7 place-items-center rounded-full", l.completed ? "bg-ok-soft text-ok" : "bg-brand-soft text-brand-ink")}>
        {l.completed ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />}
      </span>
    ),
    lesson: l,
  });
  const upNext = useMemo(
    () =>
      courses
        .filter((c) => c.next && c.status !== "done")
        .slice(0, 4)
        .map((c) => lessons.find((l) => l.id === c.next!.id))
        .filter((l): l is LessonSearchItem => !!l),
    [courses, lessons]
  );
  const search = useCallback(
    (q: string) => (q.trim() ? searchLessons(lessons, q, 8) : upNext).map(toItem),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lessons, upNext]
  );

  const subtitle =
    courses.length === 0 && !replays
      ? canManage
        ? "Courses and live class replays for your members."
        : `Courses and replays from ${teacherName}.`
      : [
          `${canManage ? courses.length : published.length} ${(canManage ? courses.length : published.length) === 1 ? "course" : "courses"}`,
          replays && replays.items.length > 0 ? `${replays.items.length} live class ${replays.items.length === 1 ? "replay" : "replays"}` : null,
        ]
          .filter(Boolean)
          .join(" and ");

  return (
    <div className="mx-auto max-w-[1160px] px-4 pb-12 pt-4 sm:px-6 sm:pb-[72px] sm:pt-7">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-[1.1] tracking-[-0.015em] text-ink sm:text-[32px]">Classroom</h1>
          <p className="mt-1.5 text-[15px] text-ink-2 sm:text-[16px]">{subtitle}.</p>
        </div>
        {isCreator && (
          <button type="button" className={cn(BTN_PRIMARY, "h-11 px-[18px] text-[15px]")} onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            Create course
          </button>
        )}
      </div>

      {courses.length === 0 && !replays ? (
        <div className="mt-6">
          {canManage ? (
            <FeedEmpty
              title="Create your first course"
              text="Group lessons into chapters, add a video and notes to each, and members track their progress as they go. Live class recordings land here on their own as replays."
              primary={isCreator ? { label: "Create course", onClick: () => setCreating(true) } : undefined}
            />
          ) : (
            <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
              <div className="mb-1 grid h-16 w-16 place-items-center rounded-[18px] bg-brand-soft text-brand-ink">
                <BookOpen className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="font-display text-[20px] font-semibold text-ink">No courses yet</h2>
              <p className="max-w-[48ch] text-[15px] text-ink-2">
                When {teacherName} publishes a course, it shows up here. Recordings of live classes will appear here too.
              </p>
              {liveClassesOn && (
                <Link href={communityPath(slug, "/calendar")} className={cn(BTN_SECONDARY, "mt-1.5")}>
                  <CalendarDays aria-hidden="true" />
                  See upcoming live classes
                </Link>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          {continueCourse && <ContinueCard slug={slug} course={continueCourse} />}

          {(courses.length > 0 || canManage) && (
            <section aria-labelledby="courses-title" className="mt-8 flex flex-col gap-3.5">
              <h2 id="courses-title" className="font-display text-[19px] font-semibold text-ink">
                Courses
              </h2>
              {courses.length > 0 && (
                <div role="group" aria-label="Filter courses" className="scrollbar-hide flex min-w-0 gap-1.5 overflow-x-auto">
                  {filters.map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={filter === id}
                      onClick={() => setFilter(id)}
                      className={cn(
                        "inline-flex h-[34px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-[14px] transition-colors",
                        filter === id
                          ? "border-brand-line bg-brand-soft font-semibold text-brand-ink"
                          : "border-line bg-surface font-medium text-ink-2 hover:border-line-strong hover:text-ink"
                      )}
                    >
                      {label}
                      <span className={cn("text-[12.5px] tabular-nums", filter === id ? "opacity-80" : "text-ink-3")}>{counts[id]}</span>
                    </button>
                  ))}
                </div>
              )}
              {list.length > 0 || (canManage && filter === "all") ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-5">
                  {list.map((c) => (
                    <CourseCard key={c.id} slug={slug} course={c} canManage={canManage} memberCount={memberCount} />
                  ))}
                  {isCreator && filter === "all" && (
                    <button
                      type="button"
                      onClick={() => setCreating(true)}
                      className="flex min-h-[280px] flex-col items-center justify-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-line-strong font-semibold text-ink-2 transition-colors hover:border-brand hover:bg-surface hover:text-brand-ink"
                    >
                      <span className="grid h-12 w-12 place-items-center rounded-[14px] bg-brand-soft text-brand-ink">
                        <Plus className="h-6 w-6" aria-hidden="true" />
                      </span>
                      Create course
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-9 text-center">
                  <div className="mb-1 grid h-16 w-16 place-items-center rounded-[18px] bg-brand-soft text-brand-ink">
                    {filter === "done" ? <Trophy className="h-6 w-6" aria-hidden="true" /> : <BookOpen className="h-6 w-6" aria-hidden="true" />}
                  </div>
                  <h3 className="font-display text-[19px] font-semibold text-ink">
                    {filter === "done" ? "No finished courses yet" : filter === "progress" ? "Nothing in progress" : filter === "draft" ? "No drafts" : "Nothing here"}
                  </h3>
                  <p className="max-w-[44ch] text-[15px] text-ink-2">
                    {filter === "done"
                      ? "Finish every lesson in a course and it moves here."
                      : filter === "draft"
                        ? "Every course is published."
                        : "Start a course and it shows up here with your progress."}
                  </p>
                  <button type="button" className={cn(BTN_SECONDARY, "mt-1.5")} onClick={() => setFilter("all")}>
                    See all courses
                  </button>
                </div>
              )}
            </section>
          )}

          {replays && replays.items.length > 0 && (
            <ReplaysRow
              slug={slug}
              courseSlug={replays.courseSlug}
              items={replays.items}
              isPublic={replays.isPublic}
              canManage={canManage}
              timeZone={timeZone}
            />
          )}
        </>
      )}

      {isCreator && <CreateCourseDialog open={creating} onOpenChange={setCreating} onCreate={createCourse} />}

      <SearchPalette
        open={searchOpen}
        onOpenChange={setSearchOpen}
        label="Search lessons"
        placeholder="Search lessons, like turn or frame"
        search={search}
        emptyTitle="Lessons"
        idleTitle="Up next for you"
        noResults={(q) => (q ? `No lessons match "${q}". Try a move, like turn, frame or footwork.` : "No lessons yet.")}
        onPick={(item) =>
          router.push(communityPath(slug, `/classroom/${encodeURIComponent(item.lesson.courseSlug)}?lesson=${item.lesson.id}`))
        }
      />
    </div>
  );
}
