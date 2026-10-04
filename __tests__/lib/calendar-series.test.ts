import { isValidTimeZone, weeklyStarts } from "@/lib/calendar/series";
import { classState, lessonJoinable } from "@/lib/calendar/status";

describe("weeklyStarts", () => {
  it("keeps the wall-clock time across the October clock change", () => {
    // Sunday 18 Oct 2026, 19:00 in Berlin (CEST, UTC+2); clocks go back on 25 Oct.
    const starts = weeklyStarts("2026-10-18T17:00:00Z", "Europe/Berlin", 3).map((d) => d.toISOString());
    expect(starts).toEqual(["2026-10-18T17:00:00.000Z", "2026-10-25T18:00:00.000Z", "2026-11-01T18:00:00.000Z"]);
  });
  it("clamps the number of weeks", () => {
    expect(weeklyStarts("2026-10-18T17:00:00Z", "UTC", 40)).toHaveLength(12);
    expect(weeklyStarts("2026-10-18T17:00:00Z", "UTC", 0)).toHaveLength(1);
  });
  it("checks time zone names", () => {
    expect(isValidTimeZone("Europe/Tallinn")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });
});

describe("classState", () => {
  const at = (iso: string) => new Date(iso);
  const c = { status: "scheduled", startsAt: "2026-10-18T17:00:00Z", durationMinutes: 60 };
  it("derives the state from the clock", () => {
    expect(classState(c, at("2026-10-18T15:00:00Z"))).toBe("upcoming");
    expect(classState(c, at("2026-10-18T16:50:00Z"))).toBe("soon");
    expect(classState(c, at("2026-10-18T17:30:00Z"))).toBe("live");
    expect(classState(c, at("2026-10-18T18:00:00Z"))).toBe("past");
  });
  it("trusts stored live, ended and cancelled", () => {
    expect(classState({ ...c, status: "live" }, at("2026-10-18T19:30:00Z"))).toBe("live");
    expect(classState({ ...c, status: "ended" }, at("2026-10-18T17:10:00Z"))).toBe("past");
    expect(classState({ ...c, status: "cancelled" }, at("2026-10-18T17:10:00Z"))).toBe("canceled");
  });
  it("opens lesson rooms 15 minutes either side", () => {
    expect(lessonJoinable("2026-10-18T17:00:00Z", 60, at("2026-10-18T16:46:00Z"))).toBe(true);
    expect(lessonJoinable("2026-10-18T17:00:00Z", 60, at("2026-10-18T16:40:00Z"))).toBe(false);
    expect(lessonJoinable("2026-10-18T17:00:00Z", 60, at("2026-10-18T18:14:00Z"))).toBe(true);
  });
});
