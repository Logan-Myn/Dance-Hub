// Pure helpers for the classroom (redesign phase 3). No database access here.

import { htmlToText } from "@/lib/feed/posts";

export type CourseStatus = "new" | "progress" | "done";

export function courseStatus(completed: number, total: number): CourseStatus {
  if (total > 0 && completed >= total) return "done";
  return completed > 0 ? "progress" : "new";
}

/** Covers left at the upload default count as "no cover" (we draw one). */
export function realCoverUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return /\/images\/course-placeholder\.svg$/.test(url) ? null : url;
}

export interface OrderedLesson {
  id: string;
  title: string;
  chapterId: string;
  chapterTitle: string;
  completed: boolean;
}

/** First lesson not done, in course order, with its 1-based number. */
export function nextLesson(lessons: OrderedLesson[]): (OrderedLesson & { number: number }) | null {
  const i = lessons.findIndex((l) => !l.completed);
  return i === -1 ? null : { ...lessons[i], number: i + 1 };
}

/** The lesson after `lessonId` in course order (any chapter), or null at the end. */
export function lessonAfter<T extends { id: string }>(lessons: T[], lessonId: string): T | null {
  const i = lessons.findIndex((l) => l.id === lessonId);
  return i === -1 ? null : lessons[i + 1] ?? null;
}

export interface PreviewableLesson {
  is_preview?: boolean | null;
  content?: string | null;
  playbackId?: string | null;
  videoAssetId?: string | null;
  video_asset_id?: string | null;
  playback_id?: string | null;
}

/**
 * For visitors who aren't members: keep titles for the outline, but drop the
 * notes and video of every lesson that isn't a free preview. Mux playback ids
 * are public, so a leaked id would be a free video.
 */
export function redactForPreview<L extends PreviewableLesson>(lesson: L): L {
  if (lesson.is_preview) return lesson;
  return { ...lesson, content: null, playbackId: null, videoAssetId: null, video_asset_id: null, playback_id: null };
}

export interface LessonSearchItem {
  id: string;
  title: string;
  courseSlug: string;
  courseTitle: string;
  chapterTitle: string;
  number: number;
  notes: string;
  completed: boolean;
}

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Lessons matching every word (title beats course and chapter, which beat notes). */
export function searchLessons(items: LessonSearchItem[], query: string, limit = 8): LessonSearchItem[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const scored: Array<{ item: LessonSearchItem; score: number }> = [];
  for (const item of items) {
    const title = fold(item.title);
    const where = fold(`${item.courseTitle} ${item.chapterTitle}`);
    const notes = fold(item.notes);
    if (!words.every((w) => title.includes(w) || where.includes(w) || notes.includes(w))) continue;
    const score = words.some((w) => title.includes(w)) ? 0 : words.some((w) => where.includes(w)) ? 1 : 2;
    scored.push({ item, score });
  }
  return scored.sort((a, b) => a.score - b.score).slice(0, limit).map((s) => s.item);
}

/** Lesson notes as one short line of text for search. */
export function notesForSearch(html: string | null | undefined, max = 300): string {
  return htmlToText(html ?? "").slice(0, max);
}
