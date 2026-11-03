import Link from "next/link";
import type { ReactNode } from "react";
import { LifeBuoy, Mail } from "lucide-react";
import Navbar from "@/app/components/Navbar";
import { SiteFooter } from "@/components/landing/site-footer";
import { getSession } from "@/lib/auth-session";
import { getProfileForUser } from "@/lib/community-data";
import { HELP_LANGS, helpPath, type HelpLang } from "@/lib/help";
import { HELP_CONTACT_EMAIL, HELP_UI } from "@/lib/help/ui";
import { cn } from "@/lib/utils";

/** The frame of every help page: site navigation, the help header with its language switch, and the footer. */
export async function HelpShell({ lang, slug, children }: { lang: HelpLang; slug?: string; children: ReactNode }) {
  const session = await getSession();
  const profile = session ? await getProfileForUser(session.user.id) : null;
  const t = HELP_UI[lang];

  return (
    <div className="flex min-h-screen flex-col bg-surface-2">
      <Navbar initialUser={session?.user ?? null} initialProfile={profile} />
      <div lang={lang} className="flex flex-1 flex-col">
      <div className="border-b border-line bg-surface">
        <div className="mx-auto flex h-12 max-w-[1160px] items-center justify-between gap-3 px-4 sm:px-6">
          <Link href={helpPath(lang)} className="inline-flex items-center gap-2 font-display text-[15px] font-semibold text-ink hover:text-brand-ink">
            <LifeBuoy className="h-4 w-4 text-brand" aria-hidden="true" />
            {t.helpCenter}
          </Link>
          <nav aria-label={t.language} className="flex rounded-[10px] bg-surface-2 p-[3px]">
            {HELP_LANGS.map((l) => (
              <Link
                key={l}
                href={helpPath(l, slug)}
                hrefLang={l}
                lang={l}
                aria-current={l === lang ? "page" : undefined}
                className={cn(
                  "grid h-7 place-items-center rounded-[7px] px-2.5 text-[13px] font-semibold transition-colors",
                  l === lang ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink"
                )}
              >
                {l === "en" ? "English" : "Español"}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <main className="flex-1">{children}</main>
      <SiteFooter lang={lang} />
      </div>
    </div>
  );
}

/** The closing card of every help page: where to write when a guide didn't answer. */
export function HelpContact({ lang }: { lang: HelpLang }) {
  const t = HELP_UI[lang];
  return (
    <aside className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-ink">
        <Mail className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <strong className="block font-display text-[16px] font-semibold text-ink">{t.stuckTitle}</strong>
        <span className="text-[14.5px] text-ink-2">
          {t.stuckText}{" "}
          <a href={`mailto:${HELP_CONTACT_EMAIL}`} className="font-semibold text-brand-ink underline underline-offset-[3px] hover:text-brand">
            {HELP_CONTACT_EMAIL}
          </a>
        </span>
      </div>
    </aside>
  );
}
