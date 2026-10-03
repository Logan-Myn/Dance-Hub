/**
 * The calendar works in one timezone (the viewer's saved one) for the week it
 * fetches, the days it draws and the slot a teacher clicks. The machine running
 * the tests is in whatever TZ; the viewer here is in New York, so any use of
 * the browser timezone shows up as a wrong day.
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WeekCalendar from "@/components/WeekCalendar";
import { initialCalendarRange } from "@/lib/calendar-week";

const NY = "America/New_York";
// Thursday 1 Oct 2026, 12:00 in New York.
const NOW = new Date("2026-10-01T16:00:00Z");

const mockRouter = { push: jest.fn(), refresh: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
let mockIsMobile = false;
jest.mock("@/hooks/use-is-mobile", () => ({ useIsMobile: () => mockIsMobile }));
jest.mock("@/hooks/useUserTimezone", () => ({ useUserTimezone: () => "America/New_York" }));
jest.mock("@/components/LiveClassCard", () => ({
  __esModule: true,
  default: ({ liveClass, onClick }: { liveClass: { title: string }; onClick?: () => void }) => (
    <button onClick={onClick}>{liveClass.title}</button>
  ),
}));
jest.mock("@/components/LiveClassDetailsModal", () => () => null);
jest.mock("@/components/LiveClassModal", () => ({
  __esModule: true,
  default: ({ initialDateTime }: { initialDateTime?: Date | null }) => (
    <div data-testid="create-modal">{initialDateTime?.toISOString()}</div>
  ),
}));

// Saturday 3 Oct, 20:00 in New York (Sunday 00:00 UTC).
const saturdayNight = {
  id: "lc1",
  title: "Bachata Night",
  scheduled_start_time: "2026-10-04T00:00:00.000Z",
  duration_minutes: 60,
  teacher_name: "Anna",
  status: "scheduled" as const,
  is_currently_active: false,
  is_starting_soon: false,
};

const mockFetch = jest.fn();

beforeAll(() => {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "nextTick", "queueMicrotask"],
  });
});
afterAll(() => jest.useRealTimers());

beforeEach(() => {
  mockIsMobile = false;
  mockFetch.mockReset().mockResolvedValue({ ok: true, json: async () => [saturdayNight] });
  global.fetch = mockFetch as unknown as typeof fetch;
  (global as unknown as { BroadcastChannel: unknown }).BroadcastChannel = class {
    onmessage: unknown = null;
    close() {}
    postMessage() {}
  };
});

const iso = (r: { start: Date; end: Date }) => ({ start: r.start.toISOString(), end: r.end.toISOString() });

/** Row of the desktop grid for an hour label like "8 PM"; children[1..7] are Sun..Sat. */
const hourRow = (label: string) => screen.getByText(label).closest(".grid") as HTMLElement;

it("shows a Saturday 20:00 class on Saturday of this week from the server data, without refetching", () => {
  render(
    <WeekCalendar
      communityId="c1"
      communitySlug="salsa"
      isTeacher={false}
      userTimezone={NY}
      initialClasses={[saturdayNight]}
      initialRange={iso(initialCalendarRange(NOW))}
    />
  );

  expect(screen.getByText(/Sep 27 - Oct 3, 2026/)).toBeInTheDocument();
  const saturdayCell = hourRow("8 PM").children[7] as HTMLElement;
  expect(within(saturdayCell).getByText("Bachata Night")).toBeInTheDocument();
  expect(mockFetch).not.toHaveBeenCalled();
});

it("fetches the viewer's week as UTC instants when the server data does not cover it", async () => {
  render(<WeekCalendar communityId="c1" communitySlug="salsa" isTeacher={false} userTimezone={NY} />);

  await screen.findByText("Bachata Night");
  expect(mockFetch).toHaveBeenCalledWith(
    "/api/community/salsa/live-classes?start=2026-09-27T04%3A00%3A00.000Z&end=2026-10-04T04%3A00%3A00.000Z"
  );
});

it("fetches the next week by its UTC instants", async () => {
  const user = userEvent.setup();
  render(
    <WeekCalendar
      communityId="c1"
      communitySlug="salsa"
      isTeacher={false}
      userTimezone={NY}
      initialClasses={[saturdayNight]}
      initialRange={iso(initialCalendarRange(NOW))}
    />
  );

  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
  await user.click(screen.getByRole("button", { name: "Next week" }));

  await waitFor(() =>
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/community/salsa/live-classes?start=2026-10-04T04%3A00%3A00.000Z&end=2026-10-11T04%3A00%3A00.000Z"
    )
  );
  // The Saturday class belongs to the week before, not this one.
  await waitFor(() => expect(screen.queryByText("Bachata Night")).not.toBeInTheDocument());
});

it("puts the class on Saturday in the mobile day view too", async () => {
  mockIsMobile = true;
  const user = userEvent.setup();
  render(
    <WeekCalendar
      communityId="c1"
      communitySlug="salsa"
      isTeacher={false}
      userTimezone={NY}
      initialClasses={[saturdayNight]}
      initialRange={iso(initialCalendarRange(NOW))}
    />
  );

  // Today (Thursday 1 Oct) is selected by default.
  expect(screen.getByText("Thursday, October 1")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /^S\s*3$/ }));
  expect(screen.getByText("Saturday, October 3")).toBeInTheDocument();
  expect(screen.getByText("Bachata Night")).toBeInTheDocument();
});

it("pre-fills a clicked slot as that wall-clock time in the viewer timezone", async () => {
  const user = userEvent.setup();
  render(
    <WeekCalendar
      communityId="c1"
      communitySlug="salsa"
      isTeacher
      userTimezone={NY}
      initialClasses={[]}
      initialRange={iso(initialCalendarRange(NOW))}
    />
  );

  // Friday 2 Oct, 9:30 AM New York.
  const fridayCell = hourRow("9 AM").children[6] as HTMLElement;
  const halfHours = fridayCell.querySelectorAll(".flex.flex-col > div");
  await user.click(halfHours[1] as HTMLElement);

  expect(screen.getByTestId("create-modal")).toHaveTextContent("2026-10-02T13:30:00.000Z");
});

describe("the Schedule Class button", () => {
  const renderTeacher = () =>
    render(
      <WeekCalendar
        communityId="c1"
        communitySlug="salsa"
        isTeacher
        userTimezone={NY}
        initialClasses={[]}
        initialRange={iso(initialCalendarRange(NOW))}
      />
    );

  it("opens the modal on the next half hour today", async () => {
    const user = userEvent.setup();
    renderTeacher();

    await user.click(screen.getByRole("button", { name: "Schedule class" }));

    // Thursday 1 Oct, 12:30 PM New York.
    expect(screen.getByTestId("create-modal")).toHaveTextContent("2026-10-01T16:30:00.000Z");
  });

  it("uses the first day of a later week the teacher moved to", async () => {
    const user = userEvent.setup();
    renderTeacher();

    await user.click(screen.getByRole("button", { name: "Next week" }));
    await user.click(screen.getByRole("button", { name: "Schedule class" }));

    // Sunday 4 Oct, 12:30 PM New York.
    expect(screen.getByTestId("create-modal")).toHaveTextContent("2026-10-04T16:30:00.000Z");
  });

  it("uses the day picked in the mobile day view", async () => {
    mockIsMobile = true;
    const user = userEvent.setup();
    renderTeacher();

    await user.click(screen.getByRole("button", { name: /^S\s*3$/ }));
    await user.click(screen.getByRole("button", { name: "Schedule class" }));

    // Saturday 3 Oct, 12:30 PM New York.
    expect(screen.getByTestId("create-modal")).toHaveTextContent("2026-10-03T16:30:00.000Z");
  });
});
