import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronRight, Info } from "lucide-react";
import { HelpDeviceProvider, HelpDeviceToggle, HelpShot } from "@/components/help/help-device";
import { HelpContact, HelpShell } from "@/components/help/help-shell";
import { HelpText } from "@/components/help/help-text";
import { HELP_LANGS, getHelpArticle, helpCategory, helpPath, helpSections, isHelpLang } from "@/lib/help";
import { HELP_DEVICE_COOKIE, initialHelpDevice } from "@/lib/help/shots";
import { HELP_UI } from "@/lib/help/ui";
import { cn } from "@/lib/utils";

export async function generateMetadata(props: { params: Promise<{ lang: string; slug: string }> }): Promise<Metadata> {
  const { lang, slug } = await props.params;
  const article = getHelpArticle(slug);
  if (!isHelpLang(lang) || !article) return {};
  return {
    title: `${article.title[lang]} | ${HELP_UI[lang].helpCenter} | Dance-Hub`,
    description: article.summary[lang],
    alternates: {
      canonical: helpPath(lang, slug),
      languages: { ...Object.fromEntries(HELP_LANGS.map((l) => [l, helpPath(l, slug)])), "x-default": helpPath("en", slug) },
    },
  };
}

export default async function HelpArticlePage(props: { params: Promise<{ lang: string; slug: string }> }) {
  const { lang, slug } = await props.params;
  const article = getHelpArticle(slug);
  if (!isHelpLang(lang) || !article) notFound();
  const t = HELP_UI[lang];
  const device = initialHelpDevice((await cookies()).get(HELP_DEVICE_COOKIE)?.value, (await headers()).get("user-agent"));
  const category = helpCategory(article.category);
  const related = (article.related ?? []).map(getHelpArticle).filter((a) => a !== undefined);
  // Steps are numbered across the whole article: each section's first number.
  const firstStep = article.sections.map((_, i) => 1 + article.sections.slice(0, i).reduce((n, s) => n + (s.steps?.length ?? 0), 0));

  return (
    <HelpShell lang={lang} slug={slug}>
      <div className="mx-auto grid max-w-[1160px] gap-10 px-4 pb-14 pt-6 sm:px-6 sm:pt-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label={t.allArticles} className="hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-5">
            {helpSections().map((c) => (
              <div key={c.id}>
                <p className="px-2.5 text-[12.5px] font-semibold text-ink-3">{c.title[lang]}</p>
                <ul className="mt-1 flex flex-col">
                  {c.articles.map((a) => (
                    <li key={a.slug}>
                      <Link
                        href={helpPath(lang, a.slug)}
                        aria-current={a.slug === slug ? "page" : undefined}
                        className={cn(
                          "block rounded-lg px-2.5 py-1.5 text-[14px] transition-colors",
                          a.slug === slug ? "bg-brand-soft font-semibold text-brand-ink" : "text-ink-2 hover:bg-surface hover:text-ink"
                        )}
                      >
                        {a.title[lang]}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <HelpDeviceProvider initial={device}>
        <article className="min-w-0 max-w-[720px]">
          <nav aria-label={t.breadcrumb} className="flex flex-wrap items-center gap-1 text-[13.5px] text-ink-3">
            <Link href={helpPath(lang)} className="hover:text-ink">
              {t.helpCenter}
            </Link>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{category.title[lang]}</span>
          </nav>
          <h1 className="mt-2 text-balance font-display text-[28px] font-semibold leading-[1.15] tracking-[-0.015em] text-ink sm:text-[34px]">
            {article.title[lang]}
          </h1>
          <p className="mt-2 text-[16.5px] text-ink-2">{article.summary[lang]}</p>
          <div className="mt-5 flex flex-col gap-3 border-y border-line py-3.5">
            <HelpDeviceToggle lang={lang} />
            {t.appInEnglish && (
              <p className="flex gap-2 text-[13.5px] text-ink-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {t.appInEnglish}
              </p>
            )}
          </div>

          <div className="mt-8 flex flex-col gap-11">
            {article.sections.map((section, si) => (
              <section key={si} aria-labelledby={`s-${si}`}>
                <h2 id={`s-${si}`} className="font-display text-[21px] font-semibold text-ink">
                  {section.heading[lang]}
                </h2>
                {section.intro && (
                  <p className="mt-2.5 text-[16px] leading-[1.65] text-ink-2">
                    <HelpText text={section.intro[lang]} lang={lang} />
                  </p>
                )}
                {section.shot && <HelpShot id={section.shot} lang={lang} />}
                {section.points && (
                  <ul className="mt-3 flex flex-col gap-2.5">
                    {section.points.map((point, pi) => (
                      <li key={pi} className="flex gap-3 text-[16px] leading-[1.6] text-ink-2">
                        <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                        <span>
                          <HelpText text={point[lang]} lang={lang} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {section.steps && (
                  <ol className="mt-4 flex flex-col gap-6">
                    {section.steps.map((step, i) => {
                      return (
                        <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-[13px] font-bold tabular-nums text-brand-ink" aria-hidden="true">
                            {firstStep[si] + i}
                          </span>
                          <div className="min-w-0 pt-0.5">
                            <p className="text-[16px] leading-[1.6] text-ink-2">
                              <HelpText text={step.text[lang]} lang={lang} />
                            </p>
                            {step.shot && <HelpShot id={step.shot} lang={lang} />}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
                {section.note && (
                  <p className="mt-4 rounded-xl border border-brand-line bg-brand-soft px-4 py-3 text-[14.5px] leading-[1.55] text-ink-2">
                    <HelpText text={section.note[lang]} lang={lang} />
                  </p>
                )}
              </section>
            ))}
          </div>

          {related.length > 0 && (
            <section aria-labelledby="related" className="mt-12">
              <h2 id="related" className="font-display text-[18px] font-semibold text-ink">
                {t.related}
              </h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {related.map((a) => (
                  <li key={a.slug}>
                    <Link href={helpPath(lang, a.slug)} className="group flex h-full items-start gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
                      <span className="min-w-0 flex-1">
                        <strong className="block text-[15px] font-semibold text-ink group-hover:text-brand-ink">{a.title[lang]}</strong>
                        <span className="mt-0.5 line-clamp-2 block text-[13.5px] text-ink-2">{a.summary[lang]}</span>
                      </span>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-ink-3 group-hover:text-brand-ink" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-10">
            <HelpContact lang={lang} />
          </div>
          <p className="mt-6 lg:hidden">
            <Link href={helpPath(lang)} className="text-[14.5px] font-semibold text-brand-ink hover:text-brand">
              {t.allArticles}
            </Link>
          </p>
        </article>
        </HelpDeviceProvider>
      </div>
    </HelpShell>
  );
}
