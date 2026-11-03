import { existsSync } from "fs";
import { HELP_ARTICLES, HELP_LANGS, getHelpArticle, helpNavGroups, helpSections, preferredHelpLang, type Localized } from "@/lib/help";
import { HELP_SHOT_ALT, helpShot } from "@/lib/help/shots";
import { HELP_CATEGORIES, HELP_UI } from "@/lib/help/ui";

/** Every localized string of the help center (articles, page words, categories, alt texts), with where it sits. */
function allStrings(): Array<{ where: string; value: Localized }> {
  const ui = Object.keys(HELP_UI.en)
    .filter((k) => typeof HELP_UI.en[k as keyof typeof HELP_UI.en] === "string" && k !== "appInEnglish")
    .map((k) => ({ where: `ui ${k}`, value: { en: HELP_UI.en[k as "helpCenter"], es: HELP_UI.es[k as "helpCenter"] } }));
  return [
    ...ui,
    ...HELP_CATEGORIES.flatMap((c) => [{ where: `category ${c.id}`, value: c.title }, { where: `category ${c.id}`, value: c.text }]),
    ...Object.entries(HELP_SHOT_ALT).map(([id, value]) => ({ where: `alt ${id}`, value })),
    ...HELP_ARTICLES.flatMap((a) => [
    { where: `${a.slug} title`, value: a.title },
    { where: `${a.slug} summary`, value: a.summary },
    ...a.sections.flatMap((s, si) =>
      [s.heading, s.intro, s.note, ...(s.steps ?? []).map((st) => st.text), ...(s.points ?? [])]
        .filter((v): v is Localized => v !== undefined)
        .map((value) => ({ where: `${a.slug} section ${si + 1}`, value }))
    ),
  ]),
  ];
}

describe("help center content", () => {
  it("has every string in every language", () => {
    for (const { where, value } of allStrings()) {
      for (const lang of HELP_LANGS) {
        expect({ where, lang, text: value[lang]?.trim() || "" }).toEqual({ where, lang, text: expect.stringMatching(/\S/) });
      }
    }
  });

  it("uses unique slugs, known categories and existing related guides", () => {
    const slugs = HELP_ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const a of HELP_ARTICLES) {
      expect(HELP_CATEGORIES.map((c) => c.id)).toContain(a.category);
      for (const r of a.related ?? []) expect({ from: a.slug, to: r, exists: !!getHelpArticle(r) }).toEqual({ from: a.slug, to: r, exists: true });
    }
  });

  it("only links to guides that exist", () => {
    for (const { where, value } of allStrings()) {
      for (const lang of HELP_LANGS) {
        for (const [, slug] of value[lang].matchAll(/\]\(([a-z0-9-]+)\)/g)) {
          expect({ where, slug, exists: !!getHelpArticle(slug) }).toEqual({ where, slug, exists: true });
        }
      }
    }
  });

  it("has every screenshot it shows, for phone and computer, with a description", () => {
    for (const a of HELP_ARTICLES) {
      const shots = a.sections.flatMap((s) => [s.shot, ...(s.steps ?? []).map((st) => st.shot)]).filter(Boolean) as string[];
      for (const id of shots) {
        expect({ article: a.slug, id, described: !!HELP_SHOT_ALT[id] }).toEqual({ article: a.slug, id, described: true });
        for (const device of ["phone", "desktop"] as const) {
          const shot = helpShot(id, device);
          const file = shot?.device === device && existsSync(`public${shot.src}`);
          expect({ id, device, file }).toEqual({ id, device, file: true });
        }
      }
    }
  });

  it("follows the copy rules: no em dashes, no names of the services behind the app", () => {
    for (const { where, value } of allStrings()) {
      for (const lang of HELP_LANGS) {
        expect({ where, lang, text: value[lang] }).not.toEqual({ where, lang, text: expect.stringMatching(/—|\bStripe\b|\bMux\b|\bLiveKit\b/i) });
      }
    }
  });

  it("heads only categories of two guides or more in the sidebar, listing every guide once", () => {
    const groups = helpNavGroups();
    for (const g of groups) if (g.category) expect(g.articles.length).toBeGreaterThan(1);
    groups.forEach((g, i) => {
      if (i > 0) expect(!g.category && !groups[i - 1].category).toBe(false);
    });
    expect(groups.flatMap((g) => g.articles.map((a) => a.slug))).toEqual(helpSections().flatMap((c) => c.articles.map((a) => a.slug)));
  });

  it("opens in Spanish for visitors who prefer it", () => {
    expect(preferredHelpLang("es-ES,es;q=0.9,en;q=0.8")).toBe("es");
    expect(preferredHelpLang("en-GB,es;q=0.5")).toBe("en");
    expect(preferredHelpLang(null)).toBe("en");
  });
});
