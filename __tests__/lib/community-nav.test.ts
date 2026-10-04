import { getCommunityTabs, isTabActive } from "@/lib/community-nav";
import { ALL_OFFERINGS } from "@/lib/offerings";

const base = { slug: "salsa", isMember: false, isOwner: false, isAdmin: false, offerings: ALL_OFFERINGS };
const keys = (input: Parameters<typeof getCommunityTabs>[0]) => getCommunityTabs(input).map((t) => t.key);

describe("getCommunityTabs", () => {
  it("gives visitors Community, Private lessons and About", () => {
    expect(keys(base)).toEqual(["community", "private-lessons", "about"]);
  });

  it("gives members every member tab, without Admin", () => {
    expect(keys({ ...base, isMember: true })).toEqual(["community", "classroom", "private-lessons", "calendar", "about"]);
  });

  it("adds Admin for owners and site admins", () => {
    expect(keys({ ...base, isOwner: true })).toContain("admin");
    expect(keys({ ...base, isAdmin: true })).toContain("admin");
  });

  it("hides the tabs of switched-off offerings", () => {
    const tabs = keys({
      ...base,
      isMember: true,
      offerings: { liveClasses: false, courses: false, privateLessons: false },
    });
    expect(tabs).toEqual(["community", "about"]);
  });

  it("keeps the onboarding tour IDs", () => {
    const tabs = getCommunityTabs({ ...base, isOwner: true });
    expect(tabs.map((t) => t.id)).toEqual([
      "tab-community", "tab-classroom", "tab-private-lessons", "tab-calendar", "tab-about", "tab-admin",
    ]);
  });

  it("encodes the slug in links", () => {
    expect(getCommunityTabs({ ...base, slug: "café" })[0].href).toBe("/caf%C3%A9");
  });
});

describe("isTabActive", () => {
  const tabs = getCommunityTabs({ ...base, isMember: true });
  const tab = (key: string) => tabs.find((t) => t.key === key)!;

  it("matches the feed only on the exact root", () => {
    expect(isTabActive(tab("community"), "/salsa", "salsa")).toBe(true);
    expect(isTabActive(tab("community"), "/salsa/private-lessons", "salsa")).toBe(false);
  });

  it("matches nested pages", () => {
    expect(isTabActive(tab("classroom"), "/salsa/classroom/footwork", "salsa")).toBe(true);
  });

  it("doesn't confuse similar paths", () => {
    expect(isTabActive(tab("classroom"), "/salsa/classroomx", "salsa")).toBe(false);
    expect(isTabActive(tab("community"), "/salsa-club", "salsa")).toBe(false);
  });

  it("is false without a pathname", () => {
    expect(isTabActive(tab("community"), null, "salsa")).toBe(false);
  });

  it("survives a malformed escape in the path", () => {
    expect(isTabActive(tab("classroom"), "/salsa/classroom/100%", "salsa")).toBe(true);
  });
});
