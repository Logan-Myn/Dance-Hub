import React, { act } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// The browser server build needs MessageChannel, which jsdom lacks.
import { renderToString } from "react-dom/server.node";
import { hydrateRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import CommunitySidebar from "@/components/community/CommunitySidebar";

const PERIOD_END = "2099-10-31T12:00:00.000Z";

const baseProps = {
  customLinks: [],
  communitySlug: "salsa",
  creatorId: "owner",
  isMember: true,
  isCreator: false,
  membershipPrice: 25,
  membershipEnabled: true,
  stripeAccountId: "acct_1",
  onLeaveClick: jest.fn(),
  onManageClick: jest.fn(),
  onReactivateClick: jest.fn(),
  onJoinClick: jest.fn(),
};

const canceling = { ...baseProps, memberStatus: "active", subscriptionStatus: "canceling", accessEndDate: PERIOD_END };

const sidebar = (props: React.ComponentProps<typeof CommunitySidebar>) => (
  <SWRConfig value={{ provider: () => new Map() }}>
    <CommunitySidebar {...props} />
  </SWRConfig>
);

/**
 * Formats dates as a machine in `timeZone` would when no zone is passed, so
 * the server render and the browser can disagree the way they do in prod.
 */
const realToLocaleDateString = Date.prototype.toLocaleDateString;
function runningIn(timeZone: string) {
  jest.restoreAllMocks();
  jest
    .spyOn(Date.prototype, "toLocaleDateString")
    .mockImplementation(function (this: Date, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
      return realToLocaleDateString.call(this, locales, { ...options, timeZone: options?.timeZone ?? timeZone });
    });
}

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response)
  ) as jest.Mock;
});

afterEach(() => {
  jest.restoreAllMocks();
});

it("lets a canceling member open Manage to fix their payment method", async () => {
  const onManageClick = jest.fn();
  render(sidebar({ ...canceling, onManageClick }));

  expect(screen.getByRole("button", { name: "Rejoin Community" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Manage" }));
  expect(onManageClick).toHaveBeenCalled();
});

it("hydrates the end date without a mismatch when the browser is in another time zone", async () => {
  runningIn("UTC");
  const container = document.createElement("div");
  container.innerHTML = renderToString(sidebar(canceling));
  document.body.appendChild(container);

  // UTC+14: noon UTC on Oct 31 is already Nov 1 here.
  runningIn("Pacific/Kiritimati");
  const onRecoverableError = jest.fn();
  let root: ReturnType<typeof hydrateRoot> | undefined;
  await act(async () => {
    root = hydrateRoot(container, sidebar(canceling), { onRecoverableError });
  });

  expect(onRecoverableError).not.toHaveBeenCalled();
  expect(container).toHaveTextContent("Your membership ends on November 1, 2099");
  act(() => root?.unmount());
  container.remove();
});
