import { aboutPage } from "./articles/about-page";
import { courses } from "./articles/courses";
import { gettingPaid } from "./articles/getting-paid";
import { whoCanJoin } from "./articles/who-can-join";
import { HELP_CATEGORIES } from "./ui";
import type { HelpArticle, HelpCategoryId, HelpLang } from "./types";

export * from "./types";

/** Every article, in the order the index lists them within a category. */
export const HELP_ARTICLES: HelpArticle[] = [whoCanJoin, aboutPage, courses, gettingPaid];

export function getHelpArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}

export function helpPath(lang: HelpLang, slug?: string): string {
  return slug ? `/help/${lang}/${slug}` : `/help/${lang}`;
}

/** Categories with at least one article, each with its articles. */
export function helpSections(): Array<(typeof HELP_CATEGORIES)[number] & { articles: HelpArticle[] }> {
  return HELP_CATEGORIES.map((c) => ({ ...c, articles: HELP_ARTICLES.filter((a) => a.category === c.id) })).filter(
    (c) => c.articles.length > 0
  );
}

export function helpCategory(id: HelpCategoryId) {
  return HELP_CATEGORIES.find((c) => c.id === id)!;
}

/** The visitor's language from Accept-Language: Spanish if they prefer it, English otherwise. */
export function preferredHelpLang(acceptLanguage: string | null): HelpLang {
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("es") ? "es" : "en";
}
