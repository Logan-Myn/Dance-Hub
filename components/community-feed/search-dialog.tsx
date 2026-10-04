"use client";

import { useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { InitialsAvatar } from "@/components/ds/initials-avatar";
import { highlightParts, htmlToText, searchPosts } from "@/lib/feed/posts";
import { cn } from "@/lib/utils";
import type { FeedPost } from "./types";

const KBD = "rounded-[5px] border border-b-2 border-line-strong bg-surface px-1.5 py-[3px] text-[11px] font-semibold leading-none text-ink-3";

function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded-[3px] bg-brand/20 px-px text-inherit">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}

/** Search the loaded posts by title, text and author. */
export function SearchDialog({
  open,
  onOpenChange,
  posts,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  posts: FeedPost[];
  onPick: (post: FeedPost) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    if (!query.trim()) {
      return posts
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 4)
        .map((post) => ({ post, snippet: htmlToText(post.content).slice(0, 120) }));
    }
    return searchPosts(posts, query, 8);
  }, [posts, query]);

  const pick = (post: FeedPost) => {
    onOpenChange(false);
    setQuery("");
    onPick(post);
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(24,16,36,.52)] backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-4 z-50 w-[min(600px,calc(100%-32px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2 sm:top-[12vh]"
        >
          <DialogPrimitive.Title className="sr-only">Search posts</DialogPrimitive.Title>
          <div className="flex items-center gap-2.5 border-b border-line px-4">
            <Search className="h-5 w-5 shrink-0 text-ink-3" aria-hidden="true" />
            <label htmlFor="feed-search" className="sr-only">Search posts and people</label>
            <input
              id="feed-search"
              value={query}
              autoComplete="off"
              placeholder="Search posts and people"
              role="combobox"
              aria-expanded="true"
              aria-controls="feed-search-results"
              aria-autocomplete="list"
              aria-activedescendant={results[active] ? `feed-result-${results[active].post.id}` : undefined}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter" && results[active]) {
                  e.preventDefault();
                  pick(results[active].post);
                }
              }}
              className="h-14 min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-3"
            />
            <kbd className={cn(KBD, "hidden sm:inline-block")}>Esc</kbd>
          </div>
          <div id="feed-search-results" role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-1.5">
            {results.length === 0 ? (
              <p className="px-4 py-7 text-center text-[15px] text-ink-2">
                {query.trim() ? `Nothing matches "${query.trim()}".` : "No posts yet."}
              </p>
            ) : (
              <>
                <div className="px-2.5 pb-1.5 pt-2.5 font-display text-[13px] font-semibold text-ink-3">
                  {query.trim() ? "Posts" : "Recent posts"}
                </div>
                {results.map(({ post, snippet }, i) => (
                  <button
                    key={post.id}
                    id={`feed-result-${post.id}`}
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    tabIndex={-1}
                    onMouseMove={() => setActive(i)}
                    onClick={() => pick(post)}
                    className={cn("grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[10px] p-2.5 text-left", i === active && "bg-surface-2")}
                  >
                    <InitialsAvatar id={post.userId} name={post.author.name} imageUrl={post.author.image || null} size={28} />
                    <span className="min-w-0">
                      <strong className="block truncate font-display text-[15px] font-semibold leading-snug text-ink">
                        <Highlighted text={post.title} query={query} />
                      </strong>
                      <span className="block truncate text-[13px] text-ink-3">
                        <Highlighted text={post.author.name} query={query} />
                        {snippet ? ": " : ""}
                        <Highlighted text={snippet} query={query} />
                      </span>
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
          <div className="hidden gap-3.5 border-t border-line px-4 py-2.5 text-[12.5px] text-ink-3 sm:flex">
            <span><kbd className={KBD}>↑</kbd> <kbd className={KBD}>↓</kbd> to move</span>
            <span><kbd className={KBD}>Enter</kbd> to open</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
