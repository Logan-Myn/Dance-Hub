"use client";

import { useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, ChevronDown, GripVertical, Lock, Play, Plus, Trash2 } from "lucide-react";
import { InlineConfirm } from "@/components/ds/inline-confirm";
import { cn } from "@/lib/utils";
import { ProgressBar } from "./course-cover";

export interface IndexLesson {
  id: string;
  title: string;
  completed?: boolean;
  playbackId?: string | null;
  content?: string | null;
  is_preview?: boolean | null;
  chapter_id: string;
}

export interface IndexChapter {
  id: string;
  title: string;
  lessons: IndexLesson[];
}

const vertical: Modifier = ({ transform }) => ({ ...transform, x: 0 });

function Sortable({ id, enabled, children }: { id: string; enabled: boolean; children: (handle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !enabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}>
      {children(
        enabled ? (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
            className="grid h-7 w-5 shrink-0 cursor-grab place-items-center rounded text-ink-3 hover:text-ink-2 active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null
      )}
    </div>
  );
}

function StateDot({ done, current, locked }: { done: boolean; current: boolean; locked: boolean }) {
  if (locked) {
    return (
      <span className="grid h-5 w-5 shrink-0 place-items-center text-ink-3">
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
        done ? "border-brand bg-brand text-white" : current ? "border-brand text-brand" : "border-line-strong"
      )}
    >
      {done ? <Check className="h-3 w-3" strokeWidth={3} /> : current ? <Play className="ml-px h-2 w-2 fill-current" /> : null}
    </span>
  );
}

/** Chapters and lessons with progress; in edit mode, reorder, add and delete. */
export function LessonIndex({
  chapters,
  selectedId,
  onSelect,
  title,
  showProgress,
  preview,
  editMode,
  isReplays,
  onReorderChapters,
  onReorderLessons,
  onAddLesson,
  onAddChapter,
  onDeleteLesson,
  onDeleteChapter,
  className,
}: {
  chapters: IndexChapter[];
  selectedId: string | null;
  onSelect: (lesson: IndexLesson) => void;
  title: string;
  showProgress: boolean;
  preview: boolean;
  editMode: boolean;
  isReplays: boolean;
  onReorderChapters: (event: DragEndEvent) => void;
  onReorderLessons: (chapterId: string, event: DragEndEvent) => void;
  onAddLesson: (chapterId: string, title: string) => Promise<void>;
  onAddChapter: (title: string) => Promise<void>;
  onDeleteLesson: (chapterId: string, lessonId: string) => Promise<void>;
  onDeleteChapter: (chapterId: string) => Promise<void>;
  className?: string;
}) {
  const all = chapters.flatMap((c) => c.lessons);
  const done = all.filter((l) => l.completed).length;
  const currentChapter = chapters.find((c) => c.lessons.some((l) => l.id === selectedId))?.id;
  // Chapters start open: the one being watched, and all of them for short courses.
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(chapters.map((c, i) => [c.id, chapters.length <= 4 || c.id === currentChapter || i === 0]))
  );
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [addingChapter, setAddingChapter] = useState(false);
  const [chapterDraft, setChapterDraft] = useState("");
  const [confirm, setConfirm] = useState<{ kind: "lesson" | "chapter"; id: string; chapterId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const isOpen = (id: string) => open[id] ?? true;

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === "lesson") await onDeleteLesson(confirm.chapterId, confirm.id);
      else await onDeleteChapter(confirm.id);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <nav aria-label="Lessons" className={cn("flex flex-col overflow-hidden rounded-2xl border border-line bg-surface", className)}>
      <div className="flex flex-col gap-2.5 border-b border-line px-4 pb-3.5 pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-[15px] font-semibold text-ink">{title}</h2>
          {showProgress && (
            <span className="text-[13px] tabular-nums text-ink-2">
              {done} of {all.length} {isReplays ? "watched" : "done"}
            </span>
          )}
        </div>
        {showProgress && <ProgressBar value={all.length ? (done / all.length) * 100 : 0} done={all.length > 0 && done === all.length} />}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:thin]">
        {chapters.length === 0 && !editMode && <p className="px-2.5 py-3 text-[14px] text-ink-3">No lessons yet.</p>}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onReorderChapters} modifiers={[vertical]} autoScroll={false}>
          <SortableContext items={chapters.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {chapters.map((chapter, ci) => {
              const chDone = chapter.lessons.filter((l) => l.completed).length;
              const complete = chapter.lessons.length > 0 && chDone === chapter.lessons.length;
              return (
                <Sortable key={chapter.id} id={chapter.id} enabled={editMode}>
                  {(handle) => (
                    <div className={cn(ci > 0 && "mt-1 border-t border-line pt-1")}>
                      <div className="flex items-center gap-1">
                        {handle}
                        <button
                          type="button"
                          aria-expanded={isOpen(chapter.id)}
                          onClick={() => setOpen((o) => ({ ...o, [chapter.id]: !isOpen(chapter.id) }))}
                          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] p-2.5 text-left transition-colors hover:bg-surface-2"
                        >
                          <strong className="min-w-0 flex-1 font-display text-[14.5px] font-semibold leading-[1.3] text-ink">{chapter.title}</strong>
                          {showProgress &&
                            (complete ? (
                              <span className="inline-flex items-center gap-0.5 text-[12.5px] font-bold text-ok">
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                Done
                              </span>
                            ) : (
                              <span className="text-[12.5px] tabular-nums text-ink-3">
                                {chDone}/{chapter.lessons.length}
                              </span>
                            ))}
                          <ChevronDown
                            className={cn("h-4 w-4 shrink-0 text-ink-3 transition-transform duration-200", !isOpen(chapter.id) && "-rotate-90")}
                            aria-hidden="true"
                          />
                        </button>
                        {editMode && (
                          <button
                            type="button"
                            aria-label={`Delete chapter ${chapter.title}`}
                            onClick={() => setConfirm({ kind: "chapter", id: chapter.id, chapterId: chapter.id })}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-live-soft hover:text-live"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      {confirm?.kind === "chapter" && confirm.id === chapter.id && (
                        <div className="px-2.5 pb-2">
                          <InlineConfirm
                            title="Delete this chapter?"
                            confirmLabel={busy ? "Deleting…" : "Delete chapter"}
                            cancelLabel="Keep"
                            busy={busy}
                            onCancel={() => setConfirm(null)}
                            onConfirm={runConfirm}
                          >
                            Its {chapter.lessons.length} {chapter.lessons.length === 1 ? "lesson goes" : "lessons go"} too, with their videos.
                          </InlineConfirm>
                        </div>
                      )}

                      {isOpen(chapter.id) && (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(e) => onReorderLessons(chapter.id, e)}
                          modifiers={[vertical]}
                          autoScroll={false}
                        >
                          <SortableContext items={chapter.lessons.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                            <ul>
                              {chapter.lessons.map((lesson) => {
                                const current = lesson.id === selectedId;
                                const locked = preview && !lesson.is_preview;
                                return (
                                  <li key={lesson.id}>
                                    <Sortable id={lesson.id} enabled={editMode}>
                                      {(handle) => (
                                        <>
                                          <div className="flex items-center gap-1">
                                            {handle}
                                            <button
                                              type="button"
                                              aria-current={current ? "true" : undefined}
                                              onClick={() => onSelect(lesson)}
                                              className={cn(
                                                "grid min-w-0 flex-1 grid-cols-[22px_minmax(0,1fr)] items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors",
                                                current ? "bg-brand-soft" : "hover:bg-surface-2"
                                              )}
                                            >
                                              <StateDot done={!!lesson.completed} current={current} locked={locked} />
                                              <span className="min-w-0">
                                                <span className={cn("block truncate text-[14px] leading-[1.35]", current ? "font-semibold text-brand-ink" : "text-ink")}>
                                                  {lesson.title}
                                                </span>
                                                <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
                                                  {isReplays ? "Replay" : lesson.playbackId ? "Video" : preview && locked ? "Members only" : "Reading"}
                                                  {lesson.is_preview && (
                                                    <span className="rounded-full bg-ok-soft px-1.5 text-[11px] font-semibold text-ok">Free preview</span>
                                                  )}
                                                </span>
                                              </span>
                                            </button>
                                            {editMode && (
                                              <button
                                                type="button"
                                                aria-label={`Delete lesson ${lesson.title}`}
                                                onClick={() => setConfirm({ kind: "lesson", id: lesson.id, chapterId: chapter.id })}
                                                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-live-soft hover:text-live"
                                              >
                                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                                              </button>
                                            )}
                                          </div>
                                          {confirm?.kind === "lesson" && confirm.id === lesson.id && (
                                            <div className="py-1.5 pl-[42px] pr-2.5">
                                              <InlineConfirm
                                                title="Delete this lesson and its video?"
                                                confirmLabel={busy ? "Deleting…" : "Delete"}
                                                cancelLabel="Keep"
                                                busy={busy}
                                                onCancel={() => setConfirm(null)}
                                                onConfirm={runConfirm}
                                              />
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </Sortable>
                                  </li>
                                );
                              })}
                            </ul>
                          </SortableContext>
                        </DndContext>
                      )}

                      {editMode && isOpen(chapter.id) && (
                        <div className="pb-2 pl-[42px] pr-2.5 pt-1">
                          {adding === chapter.id ? (
                            <form
                              className="flex gap-1.5"
                              onSubmit={async (e) => {
                                e.preventDefault();
                                if (!draft.trim()) return;
                                await onAddLesson(chapter.id, draft.trim());
                                setDraft("");
                                setAdding(null);
                              }}
                            >
                              <input
                                autoFocus
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => e.key === "Escape" && setAdding(null)}
                                placeholder="Lesson title"
                                aria-label="New lesson title"
                                className="h-8 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2.5 text-[13.5px] outline-none focus:border-brand focus:shadow-[0_0_0_3px_rgb(var(--ds-brand)/0.18)]"
                              />
                              <button type="submit" className="h-8 rounded-lg bg-brand px-3 text-[13px] font-semibold text-white hover:bg-brand-hover">
                                Add
                              </button>
                            </form>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setAdding(chapter.id);
                                setDraft("");
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-brand-ink hover:bg-brand-soft"
                            >
                              <Plus className="h-4 w-4" aria-hidden="true" />
                              Add lesson
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </Sortable>
              );
            })}
          </SortableContext>
        </DndContext>

        {editMode && (
          <div className="border-t border-line p-2.5">
            {addingChapter ? (
              <form
                className="flex gap-1.5"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!chapterDraft.trim()) return;
                  await onAddChapter(chapterDraft.trim());
                  setChapterDraft("");
                  setAddingChapter(false);
                }}
              >
                <input
                  autoFocus
                  value={chapterDraft}
                  onChange={(e) => setChapterDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setAddingChapter(false)}
                  placeholder="Chapter title"
                  aria-label="New chapter title"
                  className="h-8 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2.5 text-[13.5px] outline-none focus:border-brand focus:shadow-[0_0_0_3px_rgb(var(--ds-brand)/0.18)]"
                />
                <button type="submit" className="h-8 rounded-lg bg-brand px-3 text-[13px] font-semibold text-white hover:bg-brand-hover">
                  Add
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAddingChapter(true)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-brand-ink hover:bg-brand-soft"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add chapter
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
