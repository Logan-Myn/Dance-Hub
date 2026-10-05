import { cleanBlock, hasContent, holdsOwnContent, normalizeAboutPage, suggestedTemplate, templateBlocks } from "@/lib/about/model";

const all = { liveClasses: true, courses: true, privateLessons: true };

describe("about page model", () => {
  it("converts older pages without losing content", () => {
    const page = normalizeAboutPage({
      sections: [
        { id: "h", type: "hero", content: { title: "Bachata with Logan", subtitle: "Every Sunday", imageUrl: "https://cdn.x/a.jpg", buttonType: "join" } },
        { id: "t", type: "text", content: { text: "<p>Hi <script>x</script></p>" } },
        { id: "v", type: "video", content: { videoId: "pb1", videoAssetId: "as1", title: "Welcome", description: "" } },
        { id: "c", type: "cta", content: { title: "Ready?", subtitle: "Join us", buttonType: "join" } },
        { id: "l", type: "cta", content: { title: "Site", ctaText: "Visit", ctaLink: "example.com", buttonType: "link" } },
      ],
    })!;
    expect(page.sections.map((b) => b.type)).toEqual(["text", "image", "text", "video", "button"]);
    expect(page.sections[0].content).toMatchObject({ heading: "Bachata with Logan", text: "<p>Every Sunday</p>" });
    expect(page.sections[2].content.text).not.toContain("script");
    expect(page.sections[3].content).toMatchObject({ videoId: "pb1", videoAssetId: "as1" });
    expect(page.sections[4].content.ctaLink).toBe("https://example.com/");
    expect(page.finalCta).toEqual({ title: "Ready?", text: "Join us" });
  });

  it("drops the old placeholder strings and empty pages", () => {
    const page = normalizeAboutPage({ sections: [{ type: "hero", content: { title: "Add a title", subtitle: "Add a subtitle" } }] });
    expect(page).toBeNull();
    expect(normalizeAboutPage(null)).toBeNull();
    expect(normalizeAboutPage({ sections: [] })).toBeNull();
  });

  it("cleans v2 blocks from untrusted input", () => {
    expect(cleanBlock({ type: "nope" })).toBeNull();
    expect(cleanBlock({ type: "button", content: { ctaText: "Go", ctaLink: "javascript:alert(1)" } })!.content.ctaLink).toBe("");
    const faq = cleanBlock({ type: "faq", content: { items: [{ q: "Partner?", a: "No" }, { q: "", a: "" }] } })!;
    expect(faq.content.items).toEqual([{ q: "Partner?", a: "No" }]);
  });

  it("builds templates from what the community offers", () => {
    expect(suggestedTemplate(all)).toBe("live");
    expect(suggestedTemplate({ liveClasses: false, courses: false, privateLessons: true })).toBe("coaching");
    const types = templateBlocks("live", { liveClasses: false, courses: true, privateLessons: false }).map((b) => b.type);
    expect(types).not.toContain("schedule");
    expect(types).not.toContain("lessons");
    expect(types).toContain("course");
  });

  it("hides empty written blocks from visitors", () => {
    expect(hasContent({ id: "a", type: "text", content: { heading: "", text: "<p></p>" } })).toBe(false);
    expect(hasContent({ id: "a", type: "video", content: { videoId: "" } })).toBe(false);
    expect(hasContent({ id: "a", type: "quote", content: { text: "Great teacher" } })).toBe(true);
  });

  it("knows when removing a block would lose what the owner wrote", () => {
    expect(holdsOwnContent({ id: "a", type: "faq", content: { items: [] } })).toBe(false);
    expect(holdsOwnContent({ id: "a", type: "faq", content: { items: [{ q: "Do I need a partner?", a: "" }] } })).toBe(true);
    expect(holdsOwnContent({ id: "a", type: "teacher", content: {} })).toBe(false);
    expect(holdsOwnContent({ id: "a", type: "teacher", content: { bio: "I teach in Tallinn." } })).toBe(true);
    expect(holdsOwnContent({ id: "a", type: "schedule", content: {} })).toBe(false);
    expect(holdsOwnContent({ id: "a", type: "quote", content: { text: "Great teacher" } })).toBe(true);
  });

  it("lets pasted text wrap: non-breaking spaces become normal spaces", () => {
    const page = normalizeAboutPage({
      sections: [{ id: "t", type: "text", content: { text: "<p>My&nbsp;teaching&nbsp;approach\u00a0is&nbsp;structured</p>" } }],
    });
    const text = page!.sections.find((b) => b.type === "text")!.content.text!;
    expect(text).toBe("<p>My teaching approach is structured</p>");
  });
});

