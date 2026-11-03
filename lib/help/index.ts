import { aboutPage } from "./articles/about-page";
import { communityFeed } from "./articles/community-feed";
import { courses } from "./articles/courses";
import { gettingPaid } from "./articles/getting-paid";
import { gettingStarted } from "./articles/getting-started";
import { liveClasses } from "./articles/live-classes";
import { membersEmails } from "./articles/members-emails";
import { phone } from "./articles/phone";
import { privateLessons } from "./articles/private-lessons";
import { promoCodes } from "./articles/promo-codes";
import { whoCanJoin } from "./articles/who-can-join";
import { HELP_CATEGORIES } from "./ui";
import type { HelpArticle, HelpCategoryId, HelpLang } from "./types";

export * from "./types";

/** Every article, in the order the index lists them within a category. */
export const HELP_ARTICLES: HelpArticle[] = [
  gettingStarted,
  whoCanJoin,
  phone,
  aboutPage,
  courses,
  liveClasses,
  privateLessons,
  communityFeed,
  membersEmails,
  gettingPaid,
  promoCodes,
];

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

/**
 * The guides as the sidebar lists them. A category gets a heading only when it
 * holds two guides or more: a heading over a single guide reads like an empty
 * chapter. Single guides next to each other share one list.
 */
export function helpNavGroups(): Array<{ category: (typeof HELP_CATEGORIES)[number] | null; articles: HelpArticle[] }> {
  const groups: ReturnType<typeof helpNavGroups> = [];
  for (const section of helpSections()) {
    const { articles, ...category } = section;
    if (articles.length > 1) {
      groups.push({ category, articles });
      continue;
    }
    const last = groups[groups.length - 1];
    if (last && !last.category) last.articles.push(...articles);
    else groups.push({ category: null, articles: [...articles] });
  }
  return groups;
}

export function helpCategory(id: HelpCategoryId) {
  return HELP_CATEGORIES.find((c) => c.id === id)!;
}

/** The visitor's language from Accept-Language: Spanish if they prefer it, English otherwise. */
export function preferredHelpLang(acceptLanguage: string | null): HelpLang {
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("es") ? "es" : "en";
}
