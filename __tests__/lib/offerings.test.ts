import { ALL_OFFERINGS, getOfferings, offeringAccess } from "@/lib/offerings";

describe("getOfferings", () => {
  it("reads the three columns", () => {
    expect(
      getOfferings({ offers_live_classes: false, offers_courses: true, offers_private_lessons: false })
    ).toEqual({ liveClasses: false, courses: true, privateLessons: false });
  });

  it("treats missing columns (migration not applied yet) as on", () => {
    expect(getOfferings({})).toEqual(ALL_OFFERINGS);
  });

  it("treats null as on", () => {
    expect(
      getOfferings({ offers_live_classes: null, offers_courses: null, offers_private_lessons: null })
    ).toEqual(ALL_OFFERINGS);
  });
});

describe("offeringAccess", () => {
  const coursesOff = { ...ALL_OFFERINGS, courses: false };

  it("allows everyone when the offering is on", () => {
    expect(offeringAccess(ALL_OFFERINGS, "courses", false)).toBe("allow");
    expect(offeringAccess(ALL_OFFERINGS, "courses", true)).toBe("allow");
  });

  it("redirects members when it's off", () => {
    expect(offeringAccess(coursesOff, "courses", false)).toBe("redirect");
  });

  it("lets managers in with a banner when it's off", () => {
    expect(offeringAccess(coursesOff, "courses", true)).toBe("banner");
  });
});
