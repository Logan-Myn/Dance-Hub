import Link from "next/link";

const LABELS = {
  en: { help: "Help center", privacy: "Privacy policy", terms: "Terms of service", built: "Built in Estonia" },
  es: { help: "Centro de ayuda", privacy: "Política de privacidad", terms: "Términos del servicio", built: "Hecho en Estonia" },
};

/** The dark footer of the homepage and the help center. Without a language, the help link lets /help pick one from the browser. */
export function SiteFooter({ lang }: { lang?: keyof typeof LABELS }) {
  const t = LABELS[lang ?? "en"];
  return (
    <footer className="bg-ink px-4 py-7 text-[13px] text-white/70 sm:px-8">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3">
        <div>
          © {new Date().getFullYear()} Dance-Hub. {t.built} 🇪🇪
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href={lang ? `/help/${lang}` : "/help"} className="hover:text-white">
            {t.help}
          </Link>
          <Link href="/privacy" className="hover:text-white">
            {t.privacy}
          </Link>
          <Link href="/terms" className="hover:text-white">
            {t.terms}
          </Link>
        </div>
      </div>
    </footer>
  );
}
