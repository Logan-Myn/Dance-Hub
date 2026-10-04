"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import { ChevronRight, ListVideo, Pencil, Settings } from "lucide-react";
import toast from "react-hot-toast";
import EditCourseModal from "@/components/EditCourseModal";
import NotifyMembersModal from "@/components/NotifyMembersModal";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/community-feed/feed-header";
import { LessonIndex, type IndexChapter } from "@/components/community-classroom/lesson-index";
import { LessonPanel, type PanelLesson } from "@/components/community-classroom/lesson-panel";
import { SearchPalette } from "@/components/ds/search-palette";
import { searchLessons, type LessonSearchItem } from "@/lib/classroom/model";
import { registerPageSearch } from "@/lib/feed/search-slot";
import { communityPath } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";
import type { Course } from "@/types/course";

type Lesson = PanelLesson & { lesson_position?: number };
type Chapter = Omit<IndexChapter, "lessons"> & { lessons: Lesson[] };

interface CourseDetailClientProps {
  communitySlug: string;
  courseSlug: string;
  community: { id: string; name: string; created_by: string };
  initialCourse: Omit<Course, "chapters"> & { chapters: Chapter[] };
  isCreator: boolean;
  isAdmin: boolean;
  /** Visitors who aren't members see only the free preview lessons. */
  mode: "member" | "preview";
  initialLessonId: string | null;
  isReplays: boolean;
  nextCourse: { slug: string; title: string } | null;
  /** Every lesson the viewer can open, for "Search lessons" (empty in preview). */
  searchIndex: LessonSearchItem[];
}

export default function CourseDetailClient({
  communitySlug: slug,
  courseSlug,
  community,
  initialCourse,
  isCreator,
  isAdmin,
  mode,
  initialLessonId,
  isReplays,
  nextCourse,
  searchIndex,
}: CourseDetailClientProps) {
  const router = useRouter();
  const preview = mode === "preview";
  const canEdit = isCreator || isAdmin;
  const [course, setCourse] = useState(initialCourse);
  const [chapters, setChapters] = useState<Chapter[]>(() =>
    (initialCourse.chapters || []).map((c) => ({ ...c, lessons: c.lessons || [] }))
  );
  const lessons = useMemo(() => chapters.flatMap((c) => c.lessons), [chapters]);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const all = (initialCourse.chapters || []).flatMap((c) => c.lessons || []);
    if (initialLessonId && all.some((l) => l.id === initialLessonId)) return initialLessonId;
    if (preview) return all.find((l) => l.is_preview)?.id ?? all[0]?.id ?? null;
    return all.find((l) => !l.completed)?.id ?? all[0]?.id ?? null;
  });
  const [editMode, setEditMode] = useState(false);
  const [editingCourse, setEditingCourse] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const savingOrder = useRef(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => (searchIndex.length ? registerPageSearch(() => setSearchOpen(true), "Search lessons") : undefined), [searchIndex.length]);
  useEffect(() => {
    if (!searchIndex.length) return;
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
  }, [searchIndex.length]);

  const selected = lessons.find((l) => l.id === selectedId) ?? null;
  const index = selected ? lessons.indexOf(selected) : -1;
  const chapterOf = (lessonId: string) => chapters.find((c) => c.lessons.some((l) => l.id === lessonId));
  const doneCount = lessons.filter((l) => l.completed).length;
  const base = `/api/community/${encodeURIComponent(slug)}/courses/${encodeURIComponent(courseSlug)}`;

  // Anything that unmounts the uploader mid-upload loses the video: reloads,
  // in-app links, other lessons, leaving edit mode. Block them until it's done.
  const blockedByUpload = () => {
    if (!uploading) return false;
    toast.error("Wait for the video upload to finish first.");
    return true;
  };
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const onClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement | null)?.closest?.("a[href]");
      if (!link || link.getAttribute("target") === "_blank") return;
      e.preventDefault();
      e.stopPropagation();
      toast.error("Wait for the video upload to finish first.");
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", onClick, true);
    };
  }, [uploading]);

  const select = (id: string) => {
    if (blockedByUpload()) return;
    setSelectedId(id);
    setSheetOpen(false);
    window.history.replaceState(null, "", `?lesson=${id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const patchLesson = (id: string, patch: Partial<Lesson>) =>
    setChapters((cs) => cs.map((c) => ({ ...c, lessons: c.lessons.map((l) => (l.id === id ? { ...l, ...patch } : l)) })));

  const setCompleted = async (lesson: Lesson, completed: boolean) => {
    const response = await fetch(`${base}/chapters/${lesson.chapter_id}/lessons/${lesson.id}/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
    if (!response.ok) throw new Error("completion failed");
    patchLesson(lesson.id, { completed });
    return completed;
  };

  const completionToast = (lesson: Lesson) => {
    const chapter = chapterOf(lesson.id);
    const after = lessons.map((l) => (l.id === lesson.id ? { ...l, completed: true } : l));
    const chapterDone = chapter && chapter.lessons.every((l) => (l.id === lesson.id ? true : l.completed));
    const total = after.filter((l) => l.completed).length;
    if (chapterDone && chapters.length > 1 && total < lessons.length) toast.success(`Chapter complete: ${chapter!.title}`);
    else toast.success(`${total} of ${lessons.length} ${isReplays ? "watched" : "done"}`);
  };

  const toggleComplete = async () => {
    if (!selected) return;
    try {
      const done = await setCompleted(selected, !selected.completed);
      if (done) completionToast(selected);
      else toast.success("Marked as not done");
    } catch {
      toast.error("Couldn't save your progress. Try again.");
    }
  };

  const completeAndContinue = async () => {
    if (!selected) return;
    try {
      if (!selected.completed) {
        await setCompleted(selected, true);
        completionToast(selected);
      }
      const next = lessons[index + 1];
      if (next) select(next.id);
    } catch {
      toast.error("Couldn't save your progress. Try again.");
    }
  };

  const saveLesson = async (data: { content?: string; videoAssetId?: string; playbackId?: string; isPreview?: boolean }) => {
    if (!selected) return;
    const response = await fetch(`${base}/chapters/${selected.chapter_id}/lessons/${selected.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: selected.title, ...data }),
    });
    if (!response.ok) throw new Error("update failed");
    const updated = await response.json();
    patchLesson(selected.id, {
      content: updated.content ?? null,
      playbackId: updated.playbackId ?? updated.playback_id ?? null,
      videoAssetId: updated.videoAssetId ?? updated.video_asset_id ?? null,
      is_preview: updated.is_preview ?? data.isPreview ?? selected.is_preview,
    });
  };

  const addChapter = async (title: string) => {
    const response = await fetch(`${base}/chapters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) return void toast.error("Couldn't add the chapter.");
    const chapter = await response.json();
    setChapters((cs) => [...cs, { ...chapter, lessons: chapter.lessons ?? [] }]);
    toast.success("Chapter added");
  };

  const addLesson = async (chapterId: string, title: string) => {
    if (blockedByUpload()) return;
    const response = await fetch(`${base}/chapters/${chapterId}/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) return void toast.error("Couldn't add the lesson.");
    const raw = await response.json();
    const lesson: Lesson = {
      ...raw,
      chapter_id: raw.chapter_id ?? chapterId,
      playbackId: raw.playbackId ?? raw.playback_id ?? null,
      videoAssetId: raw.videoAssetId ?? raw.video_asset_id ?? null,
      content: raw.content ?? null,
    };
    setChapters((cs) => cs.map((c) => (c.id === chapterId ? { ...c, lessons: [...c.lessons, lesson] } : c)));
    setSelectedId(lesson.id);
    window.history.replaceState(null, "", `?lesson=${lesson.id}`);
    toast.success("Lesson added");
  };

  const deleteLesson = async (chapterId: string, lessonId: string) => {
    const response = await fetch(`${base}/chapters/${chapterId}/lessons/${lessonId}`, { method: "DELETE" });
    if (!response.ok) return void toast.error("Couldn't delete the lesson.");
    setChapters((cs) => cs.map((c) => (c.id === chapterId ? { ...c, lessons: c.lessons.filter((l) => l.id !== lessonId) } : c)));
    if (selectedId === lessonId) setSelectedId(null);
    toast.success("Lesson deleted");
  };

  const deleteChapter = async (chapterId: string) => {
    const response = await fetch(`${base}/chapters/${chapterId}`, { method: "DELETE" });
    if (!response.ok) return void toast.error("Couldn't delete the chapter.");
    const removed = chapters.find((c) => c.id === chapterId);
    setChapters((cs) => cs.filter((c) => c.id !== chapterId));
    if (removed?.lessons.some((l) => l.id === selectedId)) setSelectedId(null);
    toast.success("Chapter deleted");
  };

  const reorderChapters = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || savingOrder.current) return;
    const from = chapters.findIndex((c) => c.id === active.id);
    const to = chapters.findIndex((c) => c.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(chapters, from, to);
    setChapters(next);
    savingOrder.current = true;
    try {
      const response = await fetch(`${base}/chapters/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapters: next }),
      });
      if (!response.ok) throw new Error();
      toast.success("Order saved");
    } catch {
      setChapters(chapters);
      toast.error("Couldn't save the new order.");
    } finally {
      savingOrder.current = false;
    }
  };

  const reorderLessons = async (chapterId: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || savingOrder.current) return;
    const chapter = chapters.find((c) => c.id === chapterId);
    if (!chapter) return;
    const from = chapter.lessons.findIndex((l) => l.id === active.id);
    const to = chapter.lessons.findIndex((l) => l.id === over.id);
    if (from < 0 || to < 0) return;
    const moved = arrayMove(chapter.lessons, from, to).map((l, i) => ({ ...l, lesson_position: i }));
    const before = chapters;
    setChapters((cs) => cs.map((c) => (c.id === chapterId ? { ...c, lessons: moved } : c)));
    savingOrder.current = true;
    try {
      const response = await fetch(`${base}/chapters/${chapterId}/lessons/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessons: moved }),
      });
      if (!response.ok) throw new Error();
      toast.success("Order saved");
    } catch {
      setChapters(before);
      toast.error("Couldn't save the new order.");
    } finally {
      savingOrder.current = false;
    }
  };

  const updateCourse = async (updates: { title: string; description: string; image?: File | null; is_public: boolean }) => {
    const form = new FormData();
    form.append("title", updates.title);
    form.append("description", updates.description);
    form.append("is_public", String(updates.is_public));
    if (updates.image) form.append("image", updates.image);
    const response = await fetch(base, { method: "PUT", body: form, cache: "no-store" });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      toast.error(data?.error || "Couldn't save the course.");
      return;
    }
    const { course: saved, madePublic } = await response.json();
    setCourse((c) => ({ ...c, ...saved }));
    if (madePublic) setNotifyOpen(true);
    toast.success("Course updated successfully");
    setEditingCourse(false);
    if (saved.slug && saved.slug !== courseSlug) router.replace(communityPath(slug, `/classroom/${saved.slug}`));
    else router.refresh();
  };

  const deleteCourse = async () => {
    const response = await fetch(base, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || "Failed to delete course");
    }
    toast.success("Course deleted");
    setEditingCourse(false);
    router.replace(communityPath(slug, "/classroom"));
    router.refresh();
  };

  const indexTitle = isReplays ? "All replays" : "Lessons";
  const indexProps = {
    chapters,
    selectedId,
    onSelect: (l: { id: string }) => select(l.id),
    title: indexTitle,
    showProgress: !preview,
    preview,
    editMode: editMode && canEdit,
    isReplays,
    onReorderChapters: reorderChapters,
    onReorderLessons: reorderLessons,
    onAddLesson: addLesson,
    onAddChapter: addChapter,
    onDeleteLesson: deleteLesson,
    onDeleteChapter: deleteChapter,
  };

  return (
    <div className="mx-auto max-w-[1160px] px-4 pb-12 pt-4 sm:px-6 sm:pb-[72px] sm:pt-7">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[14px] text-ink-3">
        {preview ? (
          <span className="font-medium text-ink-2">{community.name}</span>
        ) : (
          <Link href={communityPath(slug, "/classroom")} className="rounded font-medium text-ink-2 hover:text-brand-ink">
            Classroom
          </Link>
        )}
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
        <span aria-current="page" className="font-semibold text-ink">
          {course.title}
        </span>
      </nav>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-balance font-display text-[26px] font-semibold leading-[1.1] tracking-[-0.015em] text-ink sm:text-[30px]">{course.title}</h1>
          {course.description && <p className="mt-1.5 max-w-[62ch] text-[15.5px] text-ink-2">{course.description}</p>}
          {canEdit && !course.is_public && (
            <p className="mt-2 text-[13.5px] font-medium text-ink-3">Private draft. Only you can see it until you publish it in Course settings.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {preview ? (
            <Link href={communityPath(slug, "/about")} className={BTN_PRIMARY}>
              Join to watch every lesson
            </Link>
          ) : (
            canEdit && (
              <>
                <button type="button" className={BTN_SECONDARY} onClick={() => setEditingCourse(true)}>
                  <Settings aria-hidden="true" />
                  Course settings
                </button>
                <button
                  type="button"
                  aria-pressed={editMode}
                  className={editMode ? BTN_PRIMARY : BTN_SECONDARY}
                  onClick={() => !blockedByUpload() && setEditMode((m) => !m)}
                >
                  <Pencil aria-hidden="true" />
                  {editMode ? "Done editing" : "Edit content"}
                </button>
              </>
            )
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 items-start gap-7 lg:mt-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <LessonIndex
          {...indexProps}
          className="sticky top-[calc(env(safe-area-inset-top)+76px)] hidden max-h-[calc(100vh-92px)] lg:flex"
        />

        <div className="flex min-w-0 flex-col gap-4">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className={cn(BTN_SECONDARY, "self-start lg:hidden")}
            aria-haspopup="dialog"
          >
            <ListVideo aria-hidden="true" />
            {indexTitle}
            {!preview && (
              <span className="tabular-nums text-ink-3">
                {doneCount}/{lessons.length}
              </span>
            )}
          </button>

          {selected ? (
            <LessonPanel
              key={selected.id}
              slug={slug}
              courseSlug={courseSlug}
              lesson={selected}
              chapterTitle={chapterOf(selected.id)?.title ?? ""}
              number={index + 1}
              total={lessons.length}
              isReplays={isReplays}
              preview={preview}
              canEdit={canEdit}
              editMode={editMode && canEdit}
              communityId={community.id}
              prev={index > 0 ? lessons[index - 1] : null}
              next={lessons[index + 1] ?? null}
              courseDone={lessons.length > 0 && doneCount === lessons.length}
              nextCourse={nextCourse}
              courseTitle={course.title}
              onSelect={select}
              onToggleComplete={toggleComplete}
              onCompleteAndContinue={completeAndContinue}
              onSaveLesson={saveLesson}
              onUploadingChange={setUploading}
              uploading={uploading}
              coursePublished={!!course.is_public}
            />
          ) : (
            <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
              <h2 className="font-display text-[20px] font-semibold text-ink">{lessons.length ? "Pick a lesson" : "No lessons yet"}</h2>
              <p className="max-w-[48ch] text-[15px] text-ink-2">
                {lessons.length
                  ? "Choose a lesson from the list to start."
                  : canEdit
                    ? "Turn on Edit content, add a chapter, then add lessons with a video and notes."
                    : "Lessons will show up here as soon as they're added."}
              </p>
              {!lessons.length && canEdit && !editMode && (
                <button type="button" className={cn(BTN_PRIMARY, "mt-1.5")} onClick={() => setEditMode(true)}>
                  <Pencil aria-hidden="true" />
                  Edit content
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <DialogPrimitive.Root open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 flex items-end bg-[rgba(24,16,36,.52)] backdrop-blur-[2px] motion-safe:animate-scrim-in lg:hidden">
            <DialogPrimitive.Content
              aria-describedby={undefined}
              className="flex max-h-[82vh] w-full flex-col overflow-hidden rounded-t-[20px] bg-surface pb-[env(safe-area-inset-bottom)] shadow-overlay outline-none motion-safe:animate-sheet-in"
            >
              <DialogPrimitive.Title className="sr-only">{indexTitle}</DialogPrimitive.Title>
              <LessonIndex {...indexProps} className="min-h-0 flex-1 rounded-none border-0" />
            </DialogPrimitive.Content>
          </DialogPrimitive.Overlay>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {searchIndex.length > 0 && (
        <SearchPalette
          open={searchOpen}
          onOpenChange={setSearchOpen}
          label="Search lessons"
          placeholder="Search lessons, like turn or frame"
          search={(q) =>
            (q.trim()
              ? searchLessons(searchIndex, q, 8)
              : lessons.filter((l) => !l.completed).slice(0, 4).map((l) => searchIndex.find((s) => s.id === l.id)).filter((l): l is LessonSearchItem => !!l)
            ).map((l) => ({
              id: l.id,
              title: l.title,
              subtitle: `${l.courseTitle}, ${l.chapterTitle}`,
              lesson: l,
            }))
          }
          emptyTitle="Lessons"
          idleTitle="Up next in this course"
          noResults={(q) => (q ? `No lessons match "${q}". Try a move, like turn, frame or footwork.` : "You've done every lesson here.")}
          onPick={(item) => {
            if (blockedByUpload()) return;
            if (item.lesson.courseSlug === courseSlug) select(item.lesson.id);
            else router.push(communityPath(slug, `/classroom/${encodeURIComponent(item.lesson.courseSlug)}?lesson=${item.lesson.id}`));
          }}
        />
      )}

      {canEdit && (
        <EditCourseModal
          isOpen={editingCourse}
          onClose={() => setEditingCourse(false)}
          course={{ ...course, chapters: undefined } as Course}
          onUpdateCourse={updateCourse}
          onDeleteCourse={isCreator ? deleteCourse : undefined}
        />
      )}
      {canEdit && (
        <NotifyMembersModal
          isOpen={notifyOpen}
          onClose={() => setNotifyOpen(false)}
          courseName={course.title}
          communitySlug={slug}
          courseSlug={course.slug || courseSlug}
        />
      )}
    </div>
  );
}
