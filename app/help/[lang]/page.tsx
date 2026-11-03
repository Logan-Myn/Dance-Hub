import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { HelpContact, HelpShell } from "@/components/help/help-shell";
import { HelpSearch, type HelpSearchEntry } from "@/components/help/help-search";
import { HELP_ARTICLES, HELP_LANGS, helpPath, helpSections, isHelpLang, type HelpArticle, type HelpLang } from "@/lib/help";
import { HELP_UI } from "@/lib/help/ui";

export async function generateMetadata(props: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await props.params;
  if (!isHelpLang(lang)) return {};
  const t = HELP_UI[lang];
  return {
    title: `${t.helpCenter} | Dance-Hub`,
    description: t.heroText,
    alternates: {
      canonical: helpPath(lang),
      languages: { ...Object.fromEntries(HELP_LANGS.map((l) => [l, helpPath(l)])), "x-default": "/help" },
    },
  };
}

/** Every word of an article in one language, for the search box. */
function articleText(a: HelpArticle, lang: HelpLang): string {
  return a.sections
    .flatMap((s) => [s.heading, s.intro, s.note, ...(s.steps ?? []).map((st) => st.text), ...(s.points ?? [])])
    .filter((x) => x !== undefined)
    .map((x) => x[lang].replace(/\*\*|\[|\]\([a-z0-9-]+\)/g, ""))
    .join(" ");
}

export default async function HelpIndex(props: { params: Promise<{ lang: string }> }) {
  const { lang } = await props.params;
  if (!isHelpLang(lang)) notFound();
  const t = HELP_UI[lang];
  const entries: HelpSearchEntry[] = HELP_ARTICLES.map((a) => ({
    href: helpPath(lang, a.slug),
    title: a.title[lang],
    summary: a.summary[lang],
    body: articleText(a, lang),
  }));

  return (
    <HelpShell lang={lang}>
      <div className="mx-auto max-w-[1160px] px-4 pb-14 pt-8 sm:px-6 sm:pt-12">
        <h1 className="font-display text-[30px] font-semibold leading-[1.1] tracking-[-0.015em] text-ink sm:text-[38px]">{t.heroTitle}</h1>
        <p className="mt-2 max-w-[60ch] text-[16px] text-ink-2 sm:text-[17px]">{t.heroText}</p>
        {t.appInEnglish && <p className="mt-2 max-w-[60ch] text-[14px] text-ink-3">{t.appInEnglish}</p>}

        <HelpSearch lang={lang} entries={entries}>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {helpSections().map((c) => (
              <section key={c.id} aria-labelledby={`cat-${c.id}`} className="rounded-2xl border border-line bg-surface p-5">
                <h2 id={`cat-${c.id}`} className="font-display text-[19px] font-semibold text-ink">
                  {c.title[lang]}
                </h2>
                <p className="mt-0.5 text-[14px] text-ink-3">{c.text[lang]}</p>
                <ul className="mt-3 flex flex-col">
                  {c.articles.map((a) => (
                    <li key={a.slug} className="border-t border-line first:border-t-0">
                      <Link href={helpPath(lang, a.slug)} className="group flex items-start gap-3 py-3">
                        <span className="min-w-0 flex-1">
                          <strong className="block text-[15.5px] font-semibold text-ink group-hover:text-brand-ink">{a.title[lang]}</strong>
                          <span className="mt-0.5 block text-[14px] text-ink-2">{a.summary[lang]}</span>
                        </span>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-ink-3 group-hover:text-brand-ink" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </HelpSearch>

        <div className="mt-10">
          <HelpContact lang={lang} />
        </div>
      </div>
    </HelpShell>
  );
}
