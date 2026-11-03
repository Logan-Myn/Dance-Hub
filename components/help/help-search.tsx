"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import type { HelpLang } from "@/lib/help";
import { HELP_UI } from "@/lib/help/ui";

export interface HelpSearchEntry {
  href: string;
  title: string;
  summary: string;
  /** Every word of the article, to match against. */
  body: string;
}

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** A search over the guides; with a query, its results replace the list of categories. */
export function HelpSearch({ lang, entries, children }: { lang: HelpLang; entries: HelpSearchEntry[]; children: ReactNode }) {
  const t = HELP_UI[lang];
  const [query, setQuery] = useState("");
  const words = fold(query).split(/\s+/).filter(Boolean);
  const results = words.length ? entries.filter((e) => words.every((w) => fold(`${e.title} ${e.summary} ${e.body}`).includes(w))) : [];

  return (
    <>
      <label className="relative mt-6 block max-w-[560px]">
        <span className="sr-only">{t.searchLabel}</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-3" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="h-12 w-full rounded-xl border border-line-strong bg-surface pl-11 pr-4 text-[16px] text-ink shadow-card outline-none placeholder:text-ink-3 focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </label>
      <p role="status" className="sr-only">
        {words.length ? t.found(results.length) : ""}
      </p>
      {words.length ? (
        <section className="mt-8">
          {results.length ? (
            <ul className="flex flex-col gap-2.5">
              {results.map((r) => (
                <li key={r.href}>
                  <Link href={r.href} className="block rounded-2xl border border-line bg-surface px-4 py-3.5 transition-colors hover:border-line-strong hover:bg-surface-2">
                    <strong className="block font-display text-[17px] font-semibold text-ink">{r.title}</strong>
                    <span className="mt-0.5 block text-[14.5px] text-ink-2">{r.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px] text-ink-2">{t.noResults}</p>
          )}
        </section>
      ) : (
        children
      )}
    </>
  );
}
