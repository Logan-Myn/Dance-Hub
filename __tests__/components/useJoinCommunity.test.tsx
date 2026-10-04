import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import { useJoinCommunity, type JoinCommunityData } from "@/hooks/useJoinCommunity";

// The About page's Join button runs through this hook (the main join path).
const mockRouter = { push: jest.fn(), refresh: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
jest.mock("@/contexts/AuthModalContext", () => ({ useAuthModal: () => ({ showAuthModal: jest.fn() }) }));
jest.mock("react-hot-toast", () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/components/PreRegistrationPaymentModal", () => ({ PreRegistrationPaymentModal: () => null }));

type BodyProps = { onLockChange?: (locked: boolean) => void; clientSecret: string | null };
let lastBodyProps: BodyProps | null = null;
jest.mock("@/components/PaymentModal", () => ({
  PaymentModalBody: (props: BodyProps) => {
    lastBodyProps = props;
    return <div>checkout body</div>;
  },
}));

const paidCommunity: JoinCommunityData = {
  id: "c1",
  slug: "salsa",
  name: "Salsa",
  membershipEnabled: true,
  membershipPrice: 20,
  stripeAccountId: "acct_1",
};

function Harness({
  community,
  doubleCall = false,
  plan,
}: {
  community: JoinCommunityData;
  doubleCall?: boolean;
  plan?: "monthly" | "yearly";
}) {
  const { join, isJoining, modals } = useJoinCommunity(community);
  return (
    <>
      <button
        type="button"
        disabled={isJoining}
        onClick={() => {
          join(plan ? { plan } : undefined);
          if (doubleCall) join();
        }}
      >
        Join
      </button>
      {modals}
    </>
  );
}

function mockJoinPaid(reply: { status?: number; body: unknown }) {
  global.fetch = jest.fn(() => {
    const status = reply.status ?? 200;
    return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(reply.body) } as Response);
  }) as jest.Mock;
}

beforeEach(() => {
  jest.clearAllMocks();
  lastBodyProps = null;
});

it("starts only one checkout when join is triggered twice at once", async () => {
  mockJoinPaid({ body: { clientSecret: "pi_secret" } });
  render(<Harness community={paidCommunity} doubleCall />);

  await userEvent.click(screen.getByRole("button", { name: "Join" }));

  await waitFor(() => expect(lastBodyProps?.clientSecret).toBe("pi_secret"));
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

it("keeps the checkout open while the payment is locked, and lets it close afterwards", async () => {
  mockJoinPaid({ body: { clientSecret: "pi_secret" } });
  render(<Harness community={paidCommunity} />);
  await userEvent.click(screen.getByRole("button", { name: "Join" }));
  await waitFor(() => expect(lastBodyProps?.clientSecret).toBe("pi_secret"));

  act(() => lastBodyProps!.onLockChange!(true));
  await userEvent.keyboard("{Escape}");
  expect(screen.getByText("checkout body")).toBeInTheDocument();

  act(() => lastBodyProps!.onLockChange!(false));
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByText("checkout body")).not.toBeInTheDocument());
});

it("treats an already-paid earlier checkout as a successful join", async () => {
  mockJoinPaid({ status: 409, body: { error: "You're already a member of this community.", alreadyMember: true } });
  render(<Harness community={paidCommunity} />);

  await userEvent.click(screen.getByRole("button", { name: "Join" }));

  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Successfully joined the community!"));
  expect(toast.error).not.toHaveBeenCalled();
  expect(mockRouter.push).toHaveBeenCalledWith("/salsa");
  expect(screen.queryByText("checkout body")).not.toBeInTheDocument();
});

it("goes straight to checkout with the plan picked on the page", async () => {
  mockJoinPaid({ body: { clientSecret: "pi_yearly" } });
  render(<Harness community={{ ...paidCommunity, yearlyEnabled: true, yearlyPrice: 200 }} plan="yearly" />);

  await userEvent.click(screen.getByRole("button", { name: "Join" }));

  await waitFor(() => expect(lastBodyProps?.clientSecret).toBe("pi_yearly"));
  const [, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(JSON.parse(init.body)).toEqual({ plan: "yearly" });
  expect(screen.queryByText("Choose your plan")).not.toBeInTheDocument();
});

it("falls back to monthly when yearly isn't offered", async () => {
  mockJoinPaid({ body: { clientSecret: "pi_monthly" } });
  render(<Harness community={paidCommunity} plan="yearly" />);

  await userEvent.click(screen.getByRole("button", { name: "Join" }));

  await waitFor(() => expect(lastBodyProps?.clientSecret).toBe("pi_monthly"));
  expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({ plan: "monthly" });
});
