import Link from "next/link";
import type { ReactNode } from "react";
import { helpPath, type HelpLang } from "@/lib/help";

const TOKEN = /(\*\*[^*]+\*\*|\[[^\]]+\]\([a-z0-9-]+\))/g;

/** Article text: **bold** for the app's button and menu names, [text](slug) for another guide. */
export function HelpText({ text, lang }: { text: string; lang: HelpLang }): ReactNode {
  return text.split(TOKEN).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const link = /^\[([^\]]+)\]\(([a-z0-9-]+)\)$/.exec(part);
    if (link) {
      return (
        <Link key={i} href={helpPath(lang, link[2])} className="font-semibold text-brand-ink underline underline-offset-[3px] hover:text-brand">
          {link[1]}
        </Link>
      );
    }
    return part;
  });
}
