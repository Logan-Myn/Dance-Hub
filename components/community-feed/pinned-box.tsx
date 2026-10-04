"use client";

import { useSyncExternalStore } from "react";
import { ChevronDown, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeedPost } from "./types";

const listeners = new Set<() => void>();
const keyFor = (slug: string) => `feed-pinned-hidden:${slug}`;
function read(slug: string): boolean {
  try {
    return localStorage.getItem(keyFor(slug)) === "1";
  } catch {
    return false;
  }
}
function write(slug: string, hidden: boolean) {
  try {
    if (hidden) localStorage.setItem(keyFor(slug), "1");
    else localStorage.removeItem(keyFor(slug));
  } catch {
    /* private mode: the toggle still works for this page view */
  }
  listeners.forEach((l) => l());
}

/** Pinned posts in one box; Hide / Show is remembered in this browser. */
export function PinnedBox({
  slug,
  posts,
  ownerName,
  onOpen,
  renderPost,
}: {
  slug: string;
  posts: FeedPost[];
  ownerName: string;
  onOpen: (post: FeedPost) => void;
  renderPost: (post: FeedPost) => React.ReactNode;
}) {
  const hidden = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => read(slug),
    () => false
  );

  return (
    <section
      aria-label="Pinned posts"
      className="rounded-2xl border border-brand-line bg-surface bg-[linear-gradient(rgb(var(--ds-brand-soft)),rgb(var(--ds-brand-soft)))] bg-[length:100%_40px] bg-no-repeat"
    >
      <div className="flex h-10 items-center gap-2 pl-4 pr-2 text-[13px] font-semibold text-brand-ink">
        <Pin className="h-4 w-4" aria-hidden="true" />
        <span>Pinned by {ownerName}</span>
        <span className="flex-1" />
        <button
          type="button"
          aria-expanded={!hidden}
          onClick={() => write(slug, !hidden)}
          className="inline-flex h-[30px] items-center gap-1 rounded-lg px-2.5 text-[13px] font-semibold text-brand-ink hover:bg-brand/10"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", hidden && "-rotate-90")} aria-hidden="true" />
          {hidden ? "Show" : "Hide"}
        </button>
      </div>
      {hidden ? (
        <ul className="flex flex-col gap-1 px-4 pb-3 pt-1">
          {posts.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onOpen(p)} className="rounded-md text-left font-display font-semibold text-ink hover:text-brand-ink">
                {p.title}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="divide-y divide-line">{posts.map((p) => <div key={p.id}>{renderPost(p)}</div>)}</div>
      )}
    </section>
  );
}
