"use client";

import { useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { highlightParts } from "@/lib/feed/posts";
import { cn } from "@/lib/utils";

const KBD = "rounded-[5px] border border-b-2 border-line-strong bg-surface px-1.5 py-[3px] text-[11px] font-semibold leading-none text-ink-3";

export interface PaletteItem {
  id: string;
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
}

export function Highlighted({ text, query }: { text: string; query: string }) {
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

/** Search dialog: input, results with arrow keys and Enter, Esc to close. */
export function SearchPalette<T extends PaletteItem>({
  open,
  onOpenChange,
  label,
  placeholder,
  search,
  emptyTitle,
  idleTitle,
  noResults,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible name of the dialog and the input. */
  label: string;
  placeholder: string;
  /** Results for a query; an empty query gives the idle list. */
  search: (query: string) => T[];
  /** Heading over results. */
  emptyTitle: string;
  /** Heading over the idle list. */
  idleTitle: string;
  noResults: (query: string) => string;
  onPick: (item: T) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const results = useMemo(() => search(query), [search, query]);

  const pick = (item: T) => {
    onOpenChange(false);
    setQuery("");
    onPick(item);
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
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 flex justify-center bg-[rgba(24,16,36,.52)] px-4 pt-4 backdrop-blur-[2px] motion-safe:animate-scrim-in sm:pt-[12vh]">
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="h-fit w-full max-w-[600px] overflow-hidden rounded-2xl border border-line bg-surface shadow-overlay motion-safe:animate-dlg-in"
          >
            <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <Search className="h-5 w-5 shrink-0 text-ink-3" aria-hidden="true" />
              <input
                aria-label={label}
                value={query}
                autoComplete="off"
                placeholder={placeholder}
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-results"
                aria-autocomplete="list"
                aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
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
                    pick(results[active]);
                  }
                }}
                className="h-14 min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-3"
              />
              <kbd className={cn(KBD, "hidden sm:inline-block")}>Esc</kbd>
            </div>
            <div id="palette-results" role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-1.5">
              {results.length === 0 ? (
                <p className="px-4 py-7 text-center text-[15px] text-ink-2">{noResults(query.trim())}</p>
              ) : (
                <>
                  <div className="px-2.5 pb-1.5 pt-2.5 font-display text-[13px] font-semibold text-ink-3">
                    {query.trim() ? emptyTitle : idleTitle}
                  </div>
                  {results.map((item, i) => (
                    <button
                      key={item.id}
                      id={`palette-${item.id}`}
                      type="button"
                      role="option"
                      aria-selected={i === active}
                      tabIndex={-1}
                      onMouseMove={() => setActive(i)}
                      onClick={() => pick(item)}
                      className={cn("grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[10px] p-2.5 text-left", i === active && "bg-surface-2")}
                    >
                      {item.leading ?? <span />}
                      <span className="min-w-0">
                        <strong className="block truncate font-display text-[15px] font-semibold leading-snug text-ink">
                          <Highlighted text={item.title} query={query} />
                        </strong>
                        {item.subtitle && (
                          <span className="block truncate text-[13px] text-ink-3">
                            <Highlighted text={item.subtitle} query={query} />
                          </span>
                        )}
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
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
