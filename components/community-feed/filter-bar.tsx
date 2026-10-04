"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedSort } from "@/lib/feed/posts";
import { cn } from "@/lib/utils";
import type { ThreadCategory } from "./types";

/** Topic chips with counts, and Latest / Top. Sticks under the top bar. */
export function FilterBar({
  categories,
  counts,
  total,
  selected,
  onSelect,
  sort,
  onSort,
}: {
  categories: ThreadCategory[];
  counts: Record<string, number>;
  total: number;
  selected: string | null;
  onSelect: (categoryId: string | null) => void;
  sort: FeedSort;
  onSort: (sort: FeedSort) => void;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), { rootMargin: "-64px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const chip = (id: string | null, label: string, n: number, color?: string) => {
    const on = selected === id;
    return (
      <button
        key={id ?? "all"}
        type="button"
        aria-pressed={on}
        onClick={() => onSelect(id)}
        className={cn(
          "inline-flex h-[34px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-[14px] transition-colors",
          on ? "border-brand-line bg-brand-soft font-semibold text-brand-ink" : "border-line bg-surface font-medium text-ink-2 hover:border-line-strong hover:text-ink"
        )}
      >
        {color && <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
        {label}
        <span className={cn("text-[12.5px] tabular-nums", on ? "opacity-80" : "text-ink-3")}>{n}</span>
      </button>
    );
  };

  return (
    <>
      {/* Zero-height marker; the negative margin cancels the parent's gap. */}
      <div ref={sentinel} aria-hidden="true" className="-mb-4 h-0" />
      <div
        id="thread-categories"
        className={cn(
          "sticky top-[calc(env(safe-area-inset-top)+56px)] z-20 -mx-2 flex items-center gap-3 bg-canvas px-2 py-2.5 transition-shadow md:top-[calc(env(safe-area-inset-top)+60px)]",
          stuck && "shadow-[0_1px_0_rgb(var(--ds-line))]"
        )}
      >
        <div
          role="group"
          aria-label="Filter by topic"
          className="scrollbar-hide flex min-w-0 flex-1 gap-1.5 overflow-x-auto pr-7 [mask-image:linear-gradient(90deg,#000_calc(100%-28px),transparent)]"
        >
          {chip(null, "All posts", total)}
          {categories.map((c) => chip(c.id, c.name, counts[c.id] ?? 0, c.color))}
        </div>
        <div role="group" aria-label="Sort posts" className="hidden shrink-0 rounded-[10px] bg-surface-2 p-[3px] sm:inline-flex">
          {(["latest", "top"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sort === s}
              onClick={() => onSort(s)}
              className={cn(
                "h-7 rounded-[7px] px-2.5 text-[13.5px] transition-colors",
                sort === s ? "bg-surface font-semibold text-ink shadow-card" : "font-medium text-ink-2 hover:text-ink"
              )}
            >
              {s === "latest" ? "Latest" : "Top"}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="feed-sort">Sort posts</label>
        <select
          id="feed-sort"
          value={sort}
          onChange={(e) => onSort(e.target.value as FeedSort)}
          className="h-[34px] shrink-0 rounded-full border border-line bg-surface px-2.5 text-[14px] text-ink sm:hidden"
        >
          <option value="latest">Latest</option>
          <option value="top">Top</option>
        </select>
      </div>
    </>
  );
}
