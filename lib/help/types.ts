// The help center's content model. Each article holds both languages side by
// side, so a step can't exist in one language and be missing in the other.
//
// Text may use **bold** for button and menu names (always the English labels
// the app shows, in both languages, since the app itself is in English) and
// [link text](slug) to point at another article.

export const HELP_LANGS = ["en", "es"] as const;
export type HelpLang = (typeof HELP_LANGS)[number];

export type Localized = Record<HelpLang, string>;

export type HelpCategoryId = "setup" | "page" | "teaching" | "money";

export interface HelpStep {
  text: Localized;
  /** A screenshot id from lib/help/shots.ts, shown under the step. */
  shot?: string;
}

export interface HelpSection {
  heading: Localized;
  intro?: Localized;
  steps?: HelpStep[];
  /** Plain points, for options or facts rather than steps to follow. */
  points?: Localized[];
  shot?: string;
  note?: Localized;
}

export interface HelpArticle {
  slug: string;
  category: HelpCategoryId;
  title: Localized;
  summary: Localized;
  sections: HelpSection[];
  related?: string[];
}

export function isHelpLang(value: string): value is HelpLang {
  return (HELP_LANGS as readonly string[]).includes(value);
}
