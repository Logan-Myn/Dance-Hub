"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { Lock, Pin } from "lucide-react";
import toast from "react-hot-toast";
import Editor from "@/components/Editor";
import { InitialsAvatar } from "@/components/ds/initials-avatar";
import { htmlToText } from "@/lib/feed/posts";
import { cn } from "@/lib/utils";
import { BTN_GHOST, BTN_PRIMARY } from "./feed-header";
import type { FeedViewer, ThreadCategory } from "./types";

export interface ComposerHandle {
  /** Opens the composer, optionally on a topic and with starter text. */
  open: (opts?: { categoryId?: string; title?: string; body?: string }) => void;
}

// One duration for the card's height, so the bar folding away and the form
// unfolding read as a single motion. Even ease in and out (no fast start).
const OPEN_MS = 560;

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export const Composer = forwardRef<ComposerHandle, {
  communityId: string;
  categories: ThreadCategory[];
  viewer: FeedViewer;
  isOwner: boolean;
  ownerName: string;
  onPosted: (thread: Record<string, unknown>, categoryName: string | null) => void;
}>(function Composer({ communityId, categories, viewer, isOwner, ownerName, onPosted }, ref) {
  const [open, setOpenState] = useState(false);
  // The rich-text editor can't render on the server. It mounts while the
  // browser is idle after the page loads (or on first open, if that comes
  // first), so opening is only an animation, not editor setup mid-motion.
  const [editorReady, setEditorReady] = useState(false);
  const setOpen = (next: boolean) => {
    if (next) setEditorReady(true);
    setOpenState(next);
  };
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setEditorReady(true), { timeout: 2500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(() => setEditorReady(true), 1200);
    return () => clearTimeout(t);
  }, []);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; body?: string; topic?: string }>({});
  const titleRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const ids = { form: useId(), topic: useId(), title: useId(), titleErr: useId(), bodyErr: useId(), topicErr: useId() };

  const reset = () => {
    setTitle("");
    setBody("");
    setEditorKey((k) => k + 1);
    setCategoryId(null);
    setPinned(false);
    setErrors({});
  };

  useImperativeHandle(ref, () => ({
    open: (opts) => {
      setOpen(true);
      if (opts?.categoryId) setCategoryId(opts.categoryId);
      if (opts?.title) setTitle(opts.title);
      if (opts?.body) {
        setBody(opts.body);
        setEditorKey((k) => k + 1);
      }
    },
  }));

  // Focus the title once the form has finished opening: focusing inside a
  // container that's still growing makes the browser nudge it mid-motion.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => titleRef.current?.focus({ preventScroll: true }), OPEN_MS);
    return () => clearTimeout(t);
  }, [open]);

  const close = () => {
    setOpen(false);
    reset();
    // The bar is display:none until this render commits.
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const pickTopic = (c: ThreadCategory) => {
    if (c.creatorOnly && !isOwner) {
      toast(`Only ${ownerName} can post in ${c.name}`);
      return;
    }
    setCategoryId(c.id);
    setErrors((e) => ({ ...e, topic: undefined }));
  };

  const submit = async () => {
    if (busy) return;
    const next: typeof errors = {};
    if (!title.trim()) next.title = "Add a title so people know what your post is about.";
    if (!htmlToText(body)) next.body = "Add a few words before posting.";
    if (categories.length > 0 && !categoryId) next.topic = "Pick a topic.";
    setErrors(next);
    if (next.title) return titleRef.current?.focus();
    if (next.body || next.topic) return;

    setBusy(true);
    try {
      const response = await fetch("/api/threads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: body, communityId, categoryId, pinned: isOwner && pinned }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Couldn't post. Try again.");
      const name = categories.find((c) => c.id === categoryId)?.name ?? null;
      onPosted(data, name);
      setOpen(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't post. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      id="write-post"
      className={cn(
        "rounded-2xl border bg-surface shadow-card transition-[border-color,box-shadow] duration-500",
        open ? "border-brand-line shadow-[0_0_0_4px_rgb(var(--ds-brand)/0.12),0_10px_28px_-12px_rgba(30,23,48,.22)]" : "border-line"
      )}
    >
      {/* Collapsed bar folds away while the form unfolds, so the card's height
          changes in one continuous motion. */}
      <div
        className={cn(
          "grid motion-reduce:transition-none",
          // Opening: the bar fades out quickly while its row folds away.
          // Closing: it fades back in over the second half.
          open
            ? "grid-rows-[0fr] opacity-0 [transition:grid-template-rows_560ms_cubic-bezier(.65,0,.35,1),opacity_180ms_ease-out]"
            : "grid-rows-[1fr] opacity-100 [transition:grid-template-rows_560ms_cubic-bezier(.65,0,.35,1),opacity_260ms_ease-in_240ms]"
        )}
      >
      <div className="min-h-0 overflow-hidden" inert={open} aria-hidden={open}>
      <div className="flex items-center gap-3 px-3.5 py-3">
          <InitialsAvatar id={viewer.id} name={viewer.name} imageUrl={viewer.avatarUrl} size={36} />
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-controls={ids.form}
            aria-keyshortcuts="n"
            className="h-10 min-w-0 flex-1 truncate rounded-[10px] bg-surface-2 px-3.5 text-left text-[14.5px] text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink-2 sm:text-[15px]"
          >
            Share a question or a win…
          </button>
          <kbd className="hidden rounded-[5px] border border-b-2 border-line-strong bg-surface px-1.5 py-[3px] text-[11px] font-semibold leading-none text-ink-3 sm:inline-block" title="Keyboard shortcut">
            N
          </kbd>
      </div>
      </div>
      </div>

      {/* The form unfolds (grid rows 0fr to 1fr) and its contents fade in a
          beat later. It stays mounted so it can animate, inert while closed. */}
      <div
        className={cn(
          "grid [transition:grid-template-rows_560ms_cubic-bezier(.65,0,.35,1)] motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="min-h-0 overflow-hidden">
        <form
          id={ids.form}
          inert={!open}
          aria-hidden={!open}
          noValidate
          className={cn(
            "flex flex-col gap-3 px-[18px] pb-3.5 pt-4 motion-reduce:transition-none",
            // The contents settle in after the card has started to open, and
            // leave quickly when it closes.
            open
              ? "translate-y-0 opacity-100 [transition:opacity_420ms_ease-out_160ms,transform_520ms_cubic-bezier(.2,.7,.2,1)_100ms]"
              : "-translate-y-1.5 opacity-0 [transition:opacity_160ms_ease-in,transform_200ms_ease-in]"
          )}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              close();
            }
          }}
        >
          <div className="flex items-center gap-2.5 text-[14px] text-ink-2">
            <InitialsAvatar id={viewer.id} name={viewer.name} imageUrl={viewer.avatarUrl} size={28} />
            <span>
              Posting as <strong className="text-ink">{viewer.name}</strong>
            </span>
          </div>

          {categories.length > 0 && (
            <div>
              <div id={ids.topic} className="text-[13px] font-semibold text-ink-2">Topic</div>
              <div role="radiogroup" aria-labelledby={ids.topic} aria-describedby={errors.topic ? ids.topicErr : undefined} className="mt-1.5 flex flex-wrap gap-1.5">
                {categories.map((c) => {
                  const locked = !!c.creatorOnly && !isOwner;
                  const checked = categoryId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      aria-disabled={locked || undefined}
                      title={locked ? `Only ${ownerName} can post here` : undefined}
                      onClick={() => pickTopic(c)}
                      className={cn(
                        "inline-flex h-8 items-center gap-[7px] rounded-full border px-[11px] text-[13.5px] font-medium transition-colors",
                        checked ? "border-brand-line bg-brand-soft text-brand-ink" : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
                        locked && "cursor-not-allowed opacity-55"
                      )}
                    >
                      {locked ? (
                        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                      )}
                      {c.name}
                    </button>
                  );
                })}
              </div>
              {errors.topic && <p id={ids.topicErr} className="mt-1.5 text-[13px] font-medium text-live">{errors.topic}</p>}
            </div>
          )}

          <div>
            <label htmlFor={ids.title} className="sr-only">Title</label>
            <input
              ref={titleRef}
              id={ids.title}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errors.title) setErrors((x) => ({ ...x, title: undefined }));
              }}
              placeholder="Title"
              maxLength={120}
              autoComplete="off"
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? ids.titleErr : undefined}
              className="w-full rounded-[10px] border border-line bg-surface px-3 py-2.5 font-display text-[17px] font-semibold leading-[1.35] text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-3 focus:border-brand focus:shadow-[0_0_0_3px_rgb(var(--ds-brand)/0.18)] aria-[invalid=true]:border-live"
            />
            {errors.title && <p id={ids.titleErr} className="mt-1.5 text-[13px] font-medium text-live">{errors.title}</p>}
          </div>

          <div aria-describedby={errors.body ? ids.bodyErr : undefined}>
            {editorReady ? (
            <Editor
              key={editorKey}
              content={body}
              onChange={(html) => {
                setBody(html);
                if (errors.body) setErrors((x) => ({ ...x, body: undefined }));
              }}
              showHeadings={false}
              showParagraphStyle={false}
              showAlignment={false}
              placeholder="Add details. Ask your question, or tell people what you'd like feedback on."
              minHeight="96px"
            />
            ) : (
              <div className="h-[150px]" aria-hidden="true" />
            )}
            {errors.body && <p id={ids.bodyErr} className="mt-1.5 text-[13px] font-medium text-live">{errors.body}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isOwner && (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-[13.5px] font-medium text-ink-2">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                  className="h-4 w-4 rounded border-line-strong accent-[rgb(var(--ds-brand))]"
                />
                <Pin className="h-4 w-4" aria-hidden="true" />
                Pin to the top
              </label>
            )}
            <span className="flex-1" />
            <span className="hidden items-center gap-1 text-[12.5px] text-ink-3 sm:inline-flex">
              <kbd className="rounded-[5px] border border-b-2 border-line-strong bg-surface px-1.5 py-[3px] text-[11px] font-semibold leading-none">{isMac() ? "⌘" : "Ctrl"}</kbd>+
              <kbd className="rounded-[5px] border border-b-2 border-line-strong bg-surface px-1.5 py-[3px] text-[11px] font-semibold leading-none">Enter</kbd>
              to post
            </span>
            <button type="button" className={BTN_GHOST} onClick={close}>
              Cancel
            </button>
            <button type="submit" className={BTN_PRIMARY} disabled={busy}>
              {busy ? "Posting…" : "Post"}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
});
