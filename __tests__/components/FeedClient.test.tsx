import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import toast from "react-hot-toast";
import FeedClient, { type FeedClientProps } from "@/app/[communitySlug]/FeedClient";
import { ALL_OFFERINGS } from "@/lib/offerings";

const mockRouter = { push: jest.fn(), replace: jest.fn(), refresh: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/salsa",
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Ana", image: "" } }),
}));
jest.mock("react-hot-toast", () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}));
// ESM-only package Jest can't resolve; virtual so the mock stands in for it.
jest.mock(
  "nextstepjs",
  () => ({ useNextStep: () => ({ startNextStep: jest.fn(), currentTour: null }) }),
  { virtual: true }
);

// The feed itself isn't under test here, only the membership controls.
jest.mock("@/components/community-feed/feed-header", () => {
  const actual = jest.requireActual("@/components/community-feed/feed-header");
  return {
    ...actual,
    FeedHeader: ({ memberCount }: { memberCount: number }) => <div data-testid="members-count">{memberCount}</div>,
  };
});
jest.mock("@/components/community-feed/composer", () => ({ Composer: () => null }));
jest.mock("@/components/community-feed/filter-bar", () => ({ FilterBar: () => null }));
jest.mock("@/components/community-feed/search-dialog", () => ({ SearchDialog: () => null }));
jest.mock("@/components/community-feed/rail/next-class-card", () => ({ NextClassCard: () => null }));
jest.mock("@/components/ThreadModal", () => () => null);
jest.mock("@/components/PreRegistrationComingSoon", () => ({
  PreRegistrationComingSoon: ({ openingDate }: { openingDate: string | null }) => (
    <div data-testid="coming-soon">{String(openingDate)}</div>
  ),
}));
jest.mock("@/components/community/ManageSubscriptionModal", () => ({
  ManageSubscriptionModal: () => null,
}));

// Radix menus need these in jsdom.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

const PERIOD_END = "2099-10-31T12:00:00.000Z";

const community: FeedClientProps["community"] = {
  id: "c1",
  slug: "salsa",
  name: "Salsa",
  description: "",
  createdBy: "owner",
  imageUrl: null,
  imageFocalX: 50,
  imageFocalY: 50,
  imageZoom: 1,
  categories: [],
  customLinks: [],
  membershipEnabled: true,
  membershipPrice: 25,
  yearlyEnabled: false,
  stripeAccountId: "acct_1",
  status: "active",
  openingDate: null,
};

const baseProps: FeedClientProps = {
  community,
  initialThreads: [],
  viewer: { id: "u1", name: "Ana", avatarUrl: null, timezone: "UTC" },
  owner: { id: "owner", name: "Owner", avatarUrl: null },
  offerings: ALL_OFFERINGS,
  isCreator: false,
  isAdmin: false,
  isMember: true,
  isPreRegistered: false,
  memberStatus: "active",
  subscriptionStatus: "active",
  accessEndDate: null,
  newSince: null,
  serverNow: Date.parse("2099-10-01T12:00:00.000Z"),
  upcomingClasses: [],
  courseProgress: null,
  lessons: [],
};

type Reply = { status?: number; body: unknown };

/** Routes fetch by URL suffix; anything unlisted gets an empty 200. */
function mockFetch(routes: Record<string, Reply>) {
  global.fetch = jest.fn((url: RequestInfo | URL) => {
    const path = String(url);
    const match = Object.keys(routes).find((suffix) => path.endsWith(suffix));
    const reply: Reply = match
      ? routes[match]
      : { body: [] };
    const status = reply.status ?? 200;
    return Promise.resolve({
      ok: status < 400,
      status,
      json: () => Promise.resolve(reply.body),
    } as Response);
  }) as jest.Mock;
}

function renderFeed(overrides: Partial<FeedClientProps>) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <FeedClient {...baseProps} {...overrides} />
    </SWRConfig>
  );
}

/** The rail renders twice (wide rail and the narrow layout); use the first. */
const first = (els: HTMLElement[]) => els[0];

async function leaveViaMenu() {
  await userEvent.click(first(screen.getAllByRole("button", { name: /Manage/ })));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Leave community" }));
  const confirm = first(screen.getAllByRole("alertdialog"));
  await userEvent.click(within(confirm).getByRole("button", { name: "Leave community" }));
}

const CANCELING = { memberStatus: "active", subscriptionStatus: "canceling", accessEndDate: PERIOD_END };
const ACTIVE = { memberStatus: "active", subscriptionStatus: "active", accessEndDate: PERIOD_END };

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch({ "/members": { body: { members: [] } } });
});

it("keeps the canceling state when the cached member list still has the viewer as active", async () => {
  // The roster is a separate cache and can be older than the leave.
  mockFetch({
    "/members": {
      body: {
        members: [
          { user_id: "u1", status: "active", subscription_status: "active", current_period_end: PERIOD_END },
        ],
      },
    },
  });
  renderFeed(CANCELING);

  await waitFor(() => expect(screen.getByTestId("members-count")).toHaveTextContent("1"));
  expect(screen.getAllByRole("button", { name: "Rejoin" }).length).toBeGreaterThan(0);
  expect(screen.queryByRole("button", { name: /Manage/ })).not.toBeInTheDocument();
});

it("switches to Rejoin with the server's end date right after leaving", async () => {
  mockFetch({
    "/members": { body: { members: [] } },
    "/leave": {
      body: {
        success: true,
        gracePeriod: true,
        // Differs from the stored row on purpose: the UI must show the stored one.
        accessEndDate: "2099-01-15T12:00:00.000Z",
        membership: { isMember: true, status: "active", subscriptionStatus: "canceling", currentPeriodEnd: PERIOD_END },
      },
    },
  });
  renderFeed({ ...ACTIVE, accessEndDate: null });

  await leaveViaMenu();

  expect((await screen.findAllByRole("button", { name: "Rejoin" })).length).toBeGreaterThan(0);
  expect(first(screen.getAllByText(/^Ends /))).toHaveTextContent("Ends 31 Oct");
  expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("October 31, 2099"));
  // Drops the cached copy of this page, so going back to it doesn't show the old state.
  expect(mockRouter.refresh).toHaveBeenCalled();
});

it("shows the server's reason when leaving fails", async () => {
  mockFetch({
    "/members": { body: { members: [] } },
    "/leave": { status: 500, body: { error: "Failed to cancel subscription. Please try again." } },
  });
  renderFeed(ACTIVE);

  await leaveViaMenu();

  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith("Failed to cancel subscription. Please try again.")
  );
});

it("shows the server's reason when rejoining is refused", async () => {
  const reason = "Your membership payment is not up to date. Please update your payment method and try again.";
  mockFetch({
    "/members": { body: { members: [] } },
    "/reactivate": { status: 409, body: { error: reason } },
  });
  renderFeed(CANCELING);

  await userEvent.click(first(screen.getAllByRole("button", { name: "Rejoin" })));

  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(reason));
  expect(screen.getAllByRole("button", { name: "Rejoin" }).length).toBeGreaterThan(0);
});

it("still shows the access end date when leaving again after rejoining", async () => {
  mockFetch({
    "/members": { body: { members: [] } },
    "/reactivate": {
      body: {
        success: true,
        membership: { isMember: true, status: "active", subscriptionStatus: "active", currentPeriodEnd: PERIOD_END },
      },
    },
  });
  renderFeed(CANCELING);

  await userEvent.click(first(screen.getAllByRole("button", { name: "Rejoin" })));
  await userEvent.click(first(await screen.findAllByRole("button", { name: /Manage/ })));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Leave community" }));

  expect(first(screen.getAllByRole("alertdialog"))).toHaveTextContent("keep access until 31 Oct");
});

it("sends a member whose membership already ended to join again", async () => {
  mockFetch({
    "/members": { body: { members: [] } },
    "/reactivate": {
      status: 409,
      body: {
        error: "Your membership has ended. Join again to continue.",
        membership: { isMember: false, status: "inactive", subscriptionStatus: "canceled", currentPeriodEnd: null },
      },
    },
  });
  renderFeed(CANCELING);

  await userEvent.click(first(screen.getAllByRole("button", { name: "Rejoin" })));

  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Your membership has ended. Join again to continue."));
  expect(mockRouter.push).toHaveBeenCalledWith("/salsa/about");
});

it("sends a site admin who isn't a member to the About page to join", () => {
  renderFeed({ memberStatus: "inactive", subscriptionStatus: "canceled", accessEndDate: null, isMember: false, isAdmin: true });

  expect(first(screen.getAllByRole("link", { name: "Join from the About page" }))).toHaveAttribute("href", "/salsa/about");
  expect(screen.queryByRole("button", { name: /Manage/ })).not.toBeInTheDocument();
});

it("records the visit for New markers once the feed is on screen", async () => {
  renderFeed(ACTIVE);
  await waitFor(() =>
    expect((global.fetch as jest.Mock).mock.calls.some(([url, init]) => String(url).endsWith("/salsa/feed-visit") && init?.method === "POST")).toBe(true)
  );
});

it("shows a pre-registered member the coming-soon page after the community opens without a date", () => {
  renderFeed({
    isMember: false,
    isPreRegistered: true,
    memberStatus: "pre_registered",
    subscriptionStatus: null,
    accessEndDate: null,
  });

  expect(screen.getByTestId("coming-soon")).toHaveTextContent("null");
});
