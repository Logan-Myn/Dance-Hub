import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import toast from "react-hot-toast";
import FeedClient from "@/app/[communitySlug]/FeedClient";

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
  default: { success: jest.fn(), error: jest.fn() },
}));
// ESM-only package Jest can't resolve; virtual so the mock stands in for it.
jest.mock(
  "nextstepjs",
  () => ({ useNextStep: () => ({ startNextStep: jest.fn(), currentTour: null }) }),
  { virtual: true }
);
jest.mock("@/hooks/use-is-mobile", () => ({ useIsMobile: () => false }));

// The feed itself isn't under test here, only the membership controls.
jest.mock("@/components/community/CommunityHeader", () => ({
  __esModule: true,
  default: ({ membersCount }: { membersCount: number }) => (
    <div data-testid="members-count">{membersCount}</div>
  ),
}));
jest.mock("@/components/community/ComposerBox", () => () => null);
jest.mock("@/components/community/CategoryPills", () => () => null);
jest.mock("@/components/community/ThreadCardFluid", () => () => null);
jest.mock("@/components/Thread", () => () => null);
jest.mock("@/components/ThreadModal", () => () => null);
jest.mock("@/components/PaymentModal", () => () => null);
jest.mock("@/components/PreRegistrationPaymentModal", () => ({
  PreRegistrationPaymentModal: () => null,
}));
jest.mock("@/components/PreRegistrationComingSoon", () => ({
  PreRegistrationComingSoon: () => null,
}));
jest.mock("@/components/community/ManageSubscriptionModal", () => ({
  ManageSubscriptionModal: () => null,
}));

const PERIOD_END = "2099-10-31T12:00:00.000Z";

const community = {
  id: "c1",
  name: "Salsa",
  slug: "salsa",
  description: "",
  image_url: "",
  created_by: "owner",
  created_at: "2026-01-01T00:00:00.000Z",
  membersCount: 1,
  createdBy: "owner",
  imageUrl: "",
  membershipEnabled: true,
  membershipPrice: 25,
  stripeAccountId: "acct_1",
};

type Reply = { status?: number; body: unknown };

/** Routes fetch by URL suffix; anything unlisted gets an empty 200. */
function mockFetch(routes: Record<string, Reply>) {
  global.fetch = jest.fn((url: RequestInfo | URL) => {
    const path = String(url);
    const match = Object.keys(routes).find((suffix) => path.endsWith(suffix));
    const reply: Reply = match
      ? routes[match]
      : { body: path.endsWith("/salsa") ? { ...community, membership_enabled: true, membership_price: 25, stripe_account_id: "acct_1" } : [] };
    const status = reply.status ?? 200;
    return Promise.resolve({
      ok: status < 400,
      status,
      json: () => Promise.resolve(reply.body),
    } as Response);
  }) as jest.Mock;
}

function renderFeed(membership: {
  memberStatus: string | null;
  subscriptionStatus: string | null;
  accessEndDate: string | null;
  isMember?: boolean;
  isAdmin?: boolean;
}) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <FeedClient
        communitySlug="salsa"
        initialCommunity={community as never}
        initialThreads={[]}
        isCreator={false}
        isAdmin={false}
        isMember
        isPreRegistered={false}
        {...membership}
      />
    </SWRConfig>
  );
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
  expect(screen.getByRole("button", { name: "Rejoin Community" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Leave Community" })).not.toBeInTheDocument();
});

it("switches to the rejoin button with the server's end date right after leaving", async () => {
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

  await userEvent.click(screen.getByRole("button", { name: "Leave Community" }));
  await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Leave Community" }));

  expect(await screen.findByRole("button", { name: "Rejoin Community" })).toBeInTheDocument();
  expect(screen.getByText(/Your membership ends on/)).toHaveTextContent("October 31, 2099");
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

  await userEvent.click(screen.getByRole("button", { name: "Leave Community" }));
  await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Leave Community" }));

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

  await userEvent.click(screen.getByRole("button", { name: "Rejoin Community" }));

  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(reason));
  expect(screen.getByRole("button", { name: "Rejoin Community" })).toBeInTheDocument();
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

  await userEvent.click(screen.getByRole("button", { name: "Rejoin Community" }));
  await userEvent.click(await screen.findByRole("button", { name: "Leave Community" }));

  expect(within(screen.getByRole("alertdialog")).getByText(/You will have access until/)).toHaveTextContent(
    "October 31, 2099"
  );
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

  await userEvent.click(screen.getByRole("button", { name: "Rejoin Community" }));

  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Your membership has ended. Join again to continue."));
  expect(mockRouter.push).toHaveBeenCalledWith("/salsa/about");
});

it("shows member controls after an admin with an ended membership joins again", async () => {
  mockFetch({
    "/members": { body: { members: [] } },
    "/reactivate": {
      body: {
        success: true,
        membership: { isMember: true, status: "active", subscriptionStatus: "active", currentPeriodEnd: PERIOD_END },
      },
    },
  });
  // Site admins get into the feed without a live membership.
  renderFeed({ memberStatus: "inactive", subscriptionStatus: "canceled", accessEndDate: null, isMember: false, isAdmin: true });

  await userEvent.click(screen.getByRole("button", { name: "Join Again" }));

  expect(await screen.findByRole("button", { name: "Leave Community" })).toBeInTheDocument();
});

it("disables Join while the join request is in flight, so a double click starts one checkout", async () => {
  let release: (value: Response) => void = () => {};
  mockFetch({ "/members": { body: { members: [] } } });
  const baseFetch = global.fetch;
  global.fetch = jest.fn((url: RequestInfo | URL) => {
    if (String(url).endsWith("/join-paid")) {
      return new Promise<Response>((resolve) => { release = resolve; });
    }
    return baseFetch(url);
  }) as jest.Mock;
  // Non-members only reach the feed's Join button as site admins (others get the About page).
  renderFeed({ memberStatus: null, subscriptionStatus: null, accessEndDate: null, isMember: false, isAdmin: true });

  const join = await screen.findByRole("button", { name: "Join for €25/month" });
  await userEvent.dblClick(join);

  await waitFor(() => expect(join).toBeDisabled());
  const joinPaidCalls = (global.fetch as jest.Mock).mock.calls.filter(([url]) => String(url).endsWith("/join-paid"));
  expect(joinPaidCalls).toHaveLength(1);

  release({ ok: true, status: 200, json: () => Promise.resolve({ clientSecret: "pi_secret", stripeAccountId: "acct_1" }) } as Response);
  await waitFor(() => expect(join).not.toBeDisabled());
});
