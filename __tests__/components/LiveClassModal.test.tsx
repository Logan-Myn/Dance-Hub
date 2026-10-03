/**
 * The schedule modal must send the instant its date and time fields show,
 * however it was opened. Opened from the Schedule Class button it used to have
 * empty fields; Safari draws today's date in an empty date field, so it looked
 * filled in while the submit button stayed disabled until a date was picked
 * again in the picker. The viewer here is in New York; the machine can be
 * anywhere.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LiveClassModal from "@/components/LiveClassModal";

// Thursday 1 Oct 2026, 12:10 in New York.
const NOW = new Date("2026-10-01T16:10:00Z");

jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ session: { user: { id: "u1" } } }) }));
jest.mock("@/hooks/useUserTimezone", () => ({ useUserTimezone: () => "America/New_York" }));
jest.mock("@/hooks/use-is-mobile", () => ({ useIsMobile: () => false }));
jest.mock("react-hot-toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockFetch = jest.fn();

beforeAll(() => {
  // jsdom has no ResizeObserver; the switch control measures itself with it.
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  jest.useFakeTimers({
    now: NOW,
    doNotFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "nextTick", "queueMicrotask"],
  });
});
afterAll(() => jest.useRealTimers());

beforeEach(() => {
  mockFetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({}) });
  global.fetch = mockFetch as unknown as typeof fetch;
});

const sentBody = () => JSON.parse(mockFetch.mock.calls[0][1].body);

async function scheduleWithoutTouchingTheDate(props: Partial<React.ComponentProps<typeof LiveClassModal>> = {}) {
  const user = userEvent.setup();
  const onClassCreated = jest.fn();
  render(
    <LiveClassModal
      communityId="c1"
      communitySlug="salsa"
      onClose={jest.fn()}
      onClassCreated={onClassCreated}
      {...props}
    />
  );
  await user.type(screen.getByLabelText(/Class Title/), "Bachata Night");
  await user.click(screen.getByRole("button", { name: "Schedule Class" }));
  await waitFor(() => expect(onClassCreated).toHaveBeenCalled());
}

it("sends the clicked slot when the date and time are left as pre-filled", async () => {
  // Friday 2 Oct, 9:30 AM New York.
  await scheduleWithoutTouchingTheDate({ initialDateTime: new Date("2026-10-02T13:30:00Z") });

  expect(screen.getByLabelText(/Date/)).toHaveValue("2026-10-02");
  expect(screen.getByLabelText(/Time/)).toHaveValue("09:30");
  expect(mockFetch).toHaveBeenCalledWith("/api/community/salsa/live-classes", expect.objectContaining({ method: "POST" }));
  expect(sentBody().scheduled_start_time).toBe("2026-10-02T13:30:00.000Z");
});

it("fills in a real date and time when opened without a slot, and sends them", async () => {
  await scheduleWithoutTouchingTheDate();

  // The next half hour in New York: 12:30 today.
  expect(screen.getByLabelText(/Date/)).toHaveValue("2026-10-01");
  expect(screen.getByLabelText(/Time/)).toHaveValue("12:30");
  expect(sentBody().scheduled_start_time).toBe("2026-10-01T16:30:00.000Z");
});

it("keeps an edited class's time when only the title changes", async () => {
  const user = userEvent.setup();
  const onClassUpdated = jest.fn();
  render(
    <LiveClassModal
      communityId="c1"
      communitySlug="salsa"
      existingClass={{
        id: "lc1",
        title: "Salsa",
        scheduled_start_time: "2026-10-04T00:00:00.000Z",
        duration_minutes: 60,
      }}
      onClose={jest.fn()}
      onClassUpdated={onClassUpdated}
    />
  );

  expect(screen.getByLabelText(/Date/)).toHaveValue("2026-10-03");
  expect(screen.getByLabelText(/Time/)).toHaveValue("20:00");
  await user.type(screen.getByLabelText(/Class Title/), " Night");
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  await waitFor(() => expect(onClassUpdated).toHaveBeenCalled());
  expect(mockFetch).toHaveBeenCalledWith("/api/community/salsa/live-classes/lc1", expect.objectContaining({ method: "PUT" }));
  expect(sentBody().scheduled_start_time).toBe("2026-10-04T00:00:00.000Z");
});
