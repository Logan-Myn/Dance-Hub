import { groupByDay, hourOfDay, placeEvents, visibleHours } from "@/lib/calendar/grid";

const ev = (id: string, startsAt: string, durationMinutes = 60) => ({ id, startsAt, durationMinutes });

describe("calendar grid", () => {
  it("reads the hour in the viewer's zone", () => {
    expect(hourOfDay("2026-10-18T17:30:00Z", "Europe/Berlin")).toBe(19.5);
  });

  it("shows the busy hours with an hour either side, at least six rows", () => {
    expect(visibleHours([ev("a", "2026-10-18T17:00:00Z")], "UTC", false)).toEqual({ minH: 14, maxH: 20 });
    expect(visibleHours([ev("a", "2026-10-18T08:00:00Z"), ev("b", "2026-10-18T20:00:00Z", 90)], "UTC", false)).toEqual({ minH: 7, maxH: 23 });
    expect(visibleHours([], "UTC", false)).toEqual({ minH: 8, maxH: 22 });
    expect(visibleHours([ev("a", "2026-10-18T17:00:00Z")], "UTC", true)).toEqual({ minH: 6, maxH: 24 });
  });

  it("places events by minute and puts overlaps side by side", () => {
    const items = [ev("a", "2026-10-18T17:00:00Z", 60), ev("b", "2026-10-18T17:30:00Z", 60), ev("c", "2026-10-18T19:00:00Z", 30)];
    const placed = placeEvents(items, ["2026-10-18"], "UTC", 16, 21);
    const by = Object.fromEntries(placed.map((p) => [p.item.id, p]));
    expect(by.a).toMatchObject({ top: 1, height: 1, col: 0, cols: 2 });
    expect(by.b).toMatchObject({ top: 1.5, col: 1, cols: 2 });
    expect(by.c).toMatchObject({ top: 3, height: 0.5, col: 0, cols: 1 });
  });

  it("groups by the viewer's day", () => {
    const groups = groupByDay([ev("b", "2026-10-18T23:30:00Z"), ev("a", "2026-10-18T10:00:00Z")], "Europe/Tallinn");
    expect(groups.map((g) => [g.dayKey, g.items.map((i) => i.id)])).toEqual([
      ["2026-10-18", ["a"]],
      ["2026-10-19", ["b"]],
    ]);
  });
});
