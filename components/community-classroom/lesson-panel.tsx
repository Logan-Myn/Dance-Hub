"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Link2,
  Lock,
  MessageCircleQuestion,
  Pencil,
  RotateCcw,
  Sparkles,
  Trophy,
  Upload,
} from "lucide-react";
import toast from "react-hot-toast";
import Editor from "@/components/Editor";
import { MuxPlayer } from "@/components/MuxPlayer";
import VideoUpload from "@/components/VideoUpload";
import { AudioLanguagesPanel } from "@/components/audio-tracks/AudioLanguagesPanel";
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY } from "@/components/community-feed/feed-header";
import { communityPath } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";

export interface PanelLesson {
  id: string;
  title: string;
  content: string | null;
  playbackId?: string | null;
  videoAssetId?: string | null;
  completed?: boolean;
  is_preview?: boolean | null;
  chapter_id: string;
}

const RATES = [0.5, 0.75, 1, 1.25];
const KBD = "rounded-[5px] border border-b-2 border-white/25 px-1.5 py-[2px] text-[11px] font-semibold leading-none";

/** Notes, rendered from the server's sanitized HTML. */
function Notes({ html }: { html: string }) {
  return (
    <div
      className={cn(
        "prose max-w-[68ch] text-[16px] leading-[1.7] text-ink",
        "prose-p:my-2 prose-a:text-brand-ink prose-headings:font-display prose-headings:text-ink prose-strong:text-ink",
        "prose-li:my-0.5 [&_li>p]:my-0 [&_li>p]:inline prose-blockquote:border-brand-line prose-blockquote:text-ink-2"
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function LessonPanel({
  slug,
  courseSlug,
  lesson,
  chapterTitle,
  number,
  total,
  isReplays,
  preview,
  canEdit,
  editMode,
  communityId,
  prev,
  next,
  courseDone,
  nextCourse,
  courseTitle,
  onSelect,
  onToggleComplete,
  onCompleteAndContinue,
  onSaveLesson,
  onUploadingChange,
  uploading,
  coursePublished,
}: {
  slug: string;
  courseSlug: string;
  lesson: PanelLesson;
  chapterTitle: string;
  number: number;
  total: number;
  isReplays: boolean;
  preview: boolean;
  canEdit: boolean;
  editMode: boolean;
  communityId: string;
  prev: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
  courseDone: boolean;
  nextCourse: { slug: string; title: string } | null;
  courseTitle: string;
  onSelect: (id: string) => void;
  onToggleComplete: () => Promise<void>;
  onCompleteAndContinue: () => Promise<void>;
  onSaveLesson: (data: { content?: string; videoAssetId?: string; playbackId?: string; isPreview?: boolean }) => Promise<void>;
  onUploadingChange: (uploading: boolean) => void;
  uploading: boolean;
  coursePublished: boolean;
}) {
  const [ended, setEnded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [draft, setDraft] = useState(lesson.content ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [changingVideo, setChangingVideo] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = preview && !lesson.is_preview;
  const canTrack = !preview;

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await onSaveLesson({ content: draft });
      setEditingNotes(false);
      toast.success("Notes saved");
    } catch {
      toast.error("Couldn't save the notes. Try again.");
    } finally {
      setSavingNotes(false);
    }
  };

  const onVideo = async (assetId: string, playbackId: string) => {
    try {
      await onSaveLesson({ videoAssetId: assetId, playbackId });
      setChangingVideo(false);
      toast.success("Your video is processing. It will appear here when it's ready.");
    } catch {
      toast.error("Couldn't attach the video. Try again.");
    }
  };

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const copyPreviewLink = async () => {
    const url = `${window.location.origin}${communityPath(slug, `/classroom/${encodeURIComponent(courseSlug)}`)}?lesson=${lesson.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Preview link copied");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  const doneLabel = isReplays ? "Watched" : "Completed";
  const markLabel = isReplays ? "Mark as watched" : "Mark complete";
  const atEnd = !next;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Video */}
      {locked ? (
        <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-2xl bg-[#120D19] px-6 text-center text-white shadow-raised">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10">
            <Lock className="h-5 w-5" aria-hidden="true" />
          </span>
          <h3 className="font-display text-[20px] font-semibold">Join to watch every lesson</h3>
          <p className="max-w-[40ch] text-[14.5px] text-white/75">This lesson is for members. The free preview lessons are open to everyone.</p>
          <Link href={communityPath(slug, "/about")} className={cn(BTN_PRIMARY, "mt-1")}>
            See membership
          </Link>
        </div>
      ) : lesson.playbackId && !changingVideo ? (
        <div className="overflow-hidden rounded-2xl bg-[#120D19] text-[#F4F0FA] shadow-raised">
          <div className="relative">
            <MuxPlayer
              key={`${lesson.id}-${reloadKey}`}
              playbackId={lesson.playbackId}
              metadata={{ video_title: lesson.title }}
              playbackRates={RATES}
              seekOffset={5}
              autoPlay={autoPlay}
              onEnded={() => setEnded(true)}
            />
            {ended && (
              <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-3.5 bg-[rgba(12,8,18,.82)] p-5 text-center backdrop-blur-[4px] motion-safe:animate-scrim-in">
                <h3 className="font-display text-[22px] font-semibold text-white">{isReplays ? "End of the class" : "Lesson finished"}</h3>
                <p className="max-w-[40ch] text-[14.5px] text-white/80">
                  {next ? `Up next: ${next.title}.` : "That was the last lesson of this course."}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEnded(false);
                      setAutoPlay(true);
                      setReloadKey((k) => k + 1);
                    }}
                    className={cn(BTN_SECONDARY, "border-white/35 bg-transparent text-white hover:bg-white/10")}
                  >
                    <RotateCcw aria-hidden="true" />
                    Watch again
                  </button>
                  {canTrack && (
                    <button type="button" disabled={busy} onClick={() => run(onCompleteAndContinue)} className={BTN_PRIMARY}>
                      {atEnd ? (isReplays ? "Mark as watched" : "Complete course") : "Complete and continue"}
                      <ArrowRight aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-white/[.06] bg-[#1D1626] px-3 py-2 text-[12.5px] text-[#B9B0C9]">
            <span className="hidden sm:inline">
              <kbd className={KBD}>Space</kbd> play
            </span>
            <span className="hidden sm:inline">
              <kbd className={KBD}>←</kbd> <kbd className={KBD}>→</kbd> 5 s
            </span>
            <span className="ml-auto">Speed is in the player&apos;s menu</span>
          </div>
        </div>
      ) : editMode && canEdit ? (
        <div className="rounded-2xl border-[1.5px] border-dashed border-line-strong bg-surface-2 p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-display text-[15px] font-semibold text-ink">{lesson.playbackId ? "Replace the video" : "Add a video"}</h3>
            {changingVideo && !uploading && (
              <button type="button" className={BTN_GHOST} onClick={() => setChangingVideo(false)}>
                Cancel
              </button>
            )}
          </div>
          <VideoUpload
            communityId={communityId}
            onUploadComplete={onVideo}
            onUploadError={(error) => toast.error(error)}
            onUploadingChange={onUploadingChange}
          />
        </div>
      ) : null}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-ink-3">
            {chapterTitle}, {isReplays ? "replay" : "lesson"} {number} of {total}
          </p>
          <h2 className="mt-1 text-balance font-display text-[22px] font-semibold leading-[1.2] tracking-[-0.01em] text-ink sm:text-[26px]">
            {lesson.title}
          </h2>
          {lesson.is_preview && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-[12px] font-semibold text-ok">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Free preview
            </span>
          )}
        </div>
        {canTrack && !locked && (
          <button
            type="button"
            disabled={busy}
            aria-pressed={!!lesson.completed}
            onClick={() => run(onToggleComplete)}
            className={cn(BTN_SECONDARY, lesson.completed && "border-ok/40 bg-ok-soft text-ok hover:bg-ok-soft")}
          >
            {lesson.completed ? <CheckCircle2 aria-hidden="true" /> : <Circle aria-hidden="true" />}
            {lesson.completed ? doneLabel : markLabel}
          </button>
        )}
      </div>

      {/* Owner tools for this lesson */}
      {editMode && canEdit && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-line bg-surface p-2.5">
          {!editingNotes && (
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={() => {
                setDraft(lesson.content ?? "");
                setEditingNotes(true);
              }}
            >
              <Pencil aria-hidden="true" />
              {lesson.content ? "Edit notes" : "Add notes"}
            </button>
          )}
          {lesson.playbackId && !changingVideo && (
            <button type="button" className={BTN_SECONDARY} onClick={() => setChangingVideo(true)}>
              <Upload aria-hidden="true" />
              Replace video
            </button>
          )}
          {!isReplays && (
            <label className="inline-flex h-[38px] cursor-pointer items-center gap-2 rounded-[10px] px-3 text-[14px] font-semibold text-ink">
              <input
                type="checkbox"
                checked={!!lesson.is_preview}
                onChange={async (e) => {
                  try {
                    await onSaveLesson({ isPreview: e.target.checked });
                    toast.success(e.target.checked ? "Anyone can watch this lesson now" : "Back to members only");
                  } catch {
                    toast.error("Couldn't change the preview setting.");
                  }
                }}
                className="h-4 w-4 accent-[rgb(var(--ds-brand))]"
              />
              Free preview
            </label>
          )}
          {lesson.is_preview && coursePublished && (
            <button type="button" className={BTN_GHOST} onClick={copyPreviewLink}>
              <Link2 aria-hidden="true" />
              Copy preview link
            </button>
          )}
        </div>
      )}
      {editMode && canEdit && lesson.videoAssetId && (
        <AudioLanguagesPanel assetId={lesson.videoAssetId} communityId={communityId} onTracksReady={() => setReloadKey((k) => k + 1)} />
      )}

      {/* Notes */}
      {editingNotes ? (
        <div className="flex flex-col gap-3">
          <Editor key={`notes-${lesson.id}`} content={draft} onChange={setDraft} placeholder="Notes for this lesson: counts, cues, what to practice." minHeight="150px" />
          <div className="flex justify-end gap-2">
            <button type="button" className={BTN_GHOST} disabled={savingNotes} onClick={() => setEditingNotes(false)}>
              Cancel
            </button>
            <button type="button" className={BTN_PRIMARY} disabled={savingNotes} onClick={saveNotes}>
              {savingNotes ? "Saving…" : "Save notes"}
            </button>
          </div>
        </div>
      ) : lesson.content && !locked ? (
        <Notes html={lesson.content} />
      ) : editMode && canEdit ? (
        <p className="text-[14px] text-ink-3">No notes yet. Notes help members practice: counts, cues and what to watch for.</p>
      ) : null}

      {/* Ask */}
      {canTrack && !locked && (
        <div className="flex flex-wrap items-center gap-3.5 rounded-xl border border-line bg-surface px-4 py-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand-soft text-brand-ink">
            <MessageCircleQuestion className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <p className="min-w-0 flex-[1_1_220px] text-[14px] text-ink-2">
            <strong className="block text-[14.5px] text-ink">Stuck on this lesson?</strong>
            Ask in the community. Others working on it can help too.
          </p>
          <Link
            href={`${communityPath(slug)}?compose=1&title=${encodeURIComponent(`Question about "${lesson.title}"`)}`}
            className={BTN_SECONDARY}
          >
            Ask a question
          </Link>
        </div>
      )}

      {/* Finish */}
      {canTrack && courseDone && atEnd && (
        <div className="flex flex-col items-start gap-3 rounded-[20px] border border-brand-line bg-surface p-7 shadow-raised motion-safe:animate-scrim-in">
          <span className="grid h-[52px] w-[52px] place-items-center rounded-2xl bg-ok-soft text-ok">
            <Trophy className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="font-display text-[24px] font-semibold text-ink sm:text-[26px]">You finished {courseTitle}</h2>
          <p className="max-w-[52ch] text-[15px] text-ink-2">
            {isReplays ? "You've watched every replay so far." : "Every lesson is done. Keep practicing, and come back to any lesson whenever you like."}
          </p>
          <div className="flex flex-wrap gap-2">
            {nextCourse && (
              <Link href={communityPath(slug, `/classroom/${encodeURIComponent(nextCourse.slug)}`)} className={BTN_PRIMARY}>
                Start {nextCourse.title}
                <ArrowRight aria-hidden="true" />
              </Link>
            )}
            <Link href={communityPath(slug, "/classroom")} className={nextCourse ? BTN_SECONDARY : BTN_PRIMARY}>
              Back to Classroom
            </Link>
          </div>
        </div>
      )}

      {/* Nav */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        {prev ? (
          <button type="button" className={BTN_SECONDARY} onClick={() => onSelect(prev.id)}>
            <ArrowLeft aria-hidden="true" />
            Previous
          </button>
        ) : (
          <span />
        )}
        <div className="ml-auto flex items-center gap-3 text-right">
          {next && (
            <span className="hidden min-w-0 sm:block">
              <span className="block text-[12.5px] font-medium text-ink-3">Up next</span>
              <span className="block max-w-[260px] truncate text-[14px] font-semibold text-ink">{next.title}</span>
            </span>
          )}
          {next ? (
            canTrack && !locked && !lesson.completed ? (
              <button type="button" disabled={busy} className={BTN_PRIMARY} onClick={() => run(onCompleteAndContinue)}>
                Complete and continue
                <ArrowRight aria-hidden="true" />
              </button>
            ) : (
              <button type="button" className={BTN_PRIMARY} onClick={() => onSelect(next.id)}>
                Next lesson
                <ArrowRight aria-hidden="true" />
              </button>
            )
          ) : canTrack && !lesson.completed ? (
            <button type="button" disabled={busy} className={BTN_PRIMARY} onClick={() => run(onCompleteAndContinue)}>
              {isReplays ? "Mark as watched" : "Complete course"}
            </button>
          ) : (
            <Link href={communityPath(slug, "/classroom")} className={BTN_SECONDARY}>
              Back to Classroom
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
