import {
  formatTimeInZone,
  relativeDayWord,
  sameUtcOffset,
  startsIn,
  zoneAbbreviation,
} from "@/lib/time/format";

const SUNDAY_17Z = new Date("2026-10-04T17:00:00Z"); // 19:00 in Berlin (CEST)

describe("formatTimeInZone", () => {
  it("formats the wall-clock time in a given zone", () => {
    expect(formatTimeInZone(SUNDAY_17Z, "Europe/Berlin", "en-GB")).toBe("19:00");
    expect(formatTimeInZone(SUNDAY_17Z, "Europe/Tallinn", "en-GB")).toBe("20:00");
    // Newer ICU puts a narrow no-break space before PM; compare with plain spaces.
    expect(formatTimeInZone(SUNDAY_17Z, "America/New_York", "en-US").replace(/\s/g, " ")).toBe("1:00 PM");
  });
});

describe("zoneAbbreviation", () => {
  it("names the zone at that moment", () => {
    expect(zoneAbbreviation(SUNDAY_17Z, "Europe/Berlin")).toBe("CEST");
    expect(zoneAbbreviation(new Date("2026-01-11T18:00:00Z"), "Europe/Berlin")).toBe("CET");
  });
});

describe("sameUtcOffset", () => {
  it("compares offsets at that moment", () => {
    expect(sameUtcOffset(SUNDAY_17Z, "Europe/Berlin", "Europe/Madrid")).toBe(true);
    expect(sameUtcOffset(SUNDAY_17Z, "Europe/Berlin", "Europe/Tallinn")).toBe(false);
  });
});

describe("relativeDayWord", () => {
  const now = new Date("2026-10-04T08:00:00Z");

  it("says Today and Tomorrow in the given zone", () => {
    expect(relativeDayWord(SUNDAY_17Z, now, "Europe/Berlin", "en-US")).toBe("Today");
    expect(relativeDayWord(new Date("2026-10-05T17:00:00Z"), now, "Europe/Berlin", "en-US")).toBe("Tomorrow");
  });

  it("uses the zone's calendar day, not UTC's", () => {
    // 23:30 UTC on Oct 4 is 01:30 on Oct 5 in Berlin.
    expect(relativeDayWord(new Date("2026-10-04T23:30:00Z"), now, "Europe/Berlin", "en-US")).toBe("Tomorrow");
  });

  it("falls back to the weekday name", () => {
    expect(relativeDayWord(new Date("2026-10-07T18:00:00Z"), now, "Europe/Berlin", "en-US")).toBe("Wednesday");
  });
});

describe("startsIn", () => {
  const now = new Date("2026-10-04T12:00:00Z");
  const plus = (ms: number) => new Date(now.getTime() + ms);
  const MIN = 60_000;

  it("counts minutes, hours and days", () => {
    expect(startsIn(plus(4 * MIN), now)).toBe("in 4 min");
    expect(startsIn(plus(30_000), now)).toBe("in 1 min");
    expect(startsIn(plus(192 * MIN), now)).toBe("in 3 h 12 min");
    expect(startsIn(plus(180 * MIN), now)).toBe("in 3 h");
    expect(startsIn(plus(24 * 60 * MIN), now)).toBe("in 1 day");
    expect(startsIn(plus(52 * 60 * MIN), now)).toBe("in 2 days, 4 h");
  });

  it("says now once the moment has passed", () => {
    expect(startsIn(plus(-5 * MIN), now)).toBe("now");
    expect(startsIn(now, now)).toBe("now");
  });
});
