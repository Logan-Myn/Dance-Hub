import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "react-hot-toast";
import PaymentModal from "@/components/PaymentModal";

// Once a payment is confirmed the member must not be able to apply a promo
// code (which replaces the subscription) or close the dialog and join again
// while the server catches up, and the spinner must not run forever.
const mockConfirmPayment = jest.fn();
jest.mock("@stripe/react-stripe-js", () => {
  const React = jest.requireActual("react");
  return {
    Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    PaymentElement: ({ onReady }: { onReady?: () => void }) => {
      React.useEffect(() => { onReady?.(); }, [onReady]);
      return <div data-testid="payment-element" />;
    },
    useStripe: () => ({ confirmPayment: mockConfirmPayment, confirmSetup: mockConfirmPayment }),
    useElements: () => ({}),
  };
});
jest.mock("@stripe/stripe-js", () => ({ loadStripe: () => Promise.resolve({}) }));
jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
jest.mock("react-hot-toast", () => {
  const toast = { success: jest.fn(), error: jest.fn() };
  return { __esModule: true, default: toast, toast };
});

type Reply = { status?: number; body: unknown };
function mockFetch(routes: Record<string, Reply>) {
  global.fetch = jest.fn((url: RequestInfo | URL) => {
    const path = String(url);
    const match = Object.keys(routes).find((suffix) => path.endsWith(suffix));
    const reply = match ? routes[match] : { body: {} };
    const status = reply.status ?? 200;
    return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(reply.body) } as Response);
  }) as jest.Mock;
}

function renderModal(props: Partial<React.ComponentProps<typeof PaymentModal>> = {}) {
  const onClose = jest.fn();
  const onSuccess = jest.fn();
  render(
    <PaymentModal
      isOpen
      onClose={onClose}
      onSuccess={onSuccess}
      clientSecret="pi_secret"
      stripeAccountId="acct_1"
      communitySlug="salsa"
      price={20}
      {...props}
    />
  );
  return { onClose, onSuccess };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch({ "/check-subscription": { body: { hasSubscription: false } } });
});

afterEach(() => {
  jest.useRealTimers();
});

it("hides the promo entry and keeps the dialog open once the payment is confirmed", async () => {
  mockConfirmPayment.mockResolvedValue({});
  const { onClose } = renderModal();

  expect(await screen.findByRole("button", { name: "Do you have a promo code?" })).toBeInTheDocument();
  await userEvent.click(await screen.findByRole("button", { name: "Pay €20/month" }));

  expect(await screen.findByText("Processing your membership...")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Do you have a promo code?" })).not.toBeInTheDocument();

  await userEvent.keyboard("{Escape}");
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(onClose).not.toHaveBeenCalled();
});

it("can still be closed before paying, and again after a failed payment", async () => {
  mockConfirmPayment.mockResolvedValue({ error: { message: "Your card was declined." } });
  const { onClose } = renderModal();

  await userEvent.click(await screen.findByRole("button", { name: "Pay €20/month" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Your card was declined."));
  expect(screen.getByRole("button", { name: "Do you have a promo code?" })).toBeInTheDocument();

  await userEvent.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalled();
});

it("stops waiting after a minute and says what to do", async () => {
  jest.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  mockConfirmPayment.mockResolvedValue({});
  const { onClose, onSuccess } = renderModal();

  await user.click(await screen.findByRole("button", { name: "Pay €20/month" }));
  expect(await screen.findByText("Processing your membership...")).toBeInTheDocument();

  await act(async () => { jest.advanceTimersByTime(61_000); });

  expect(screen.getByText(/taking longer than usual/i)).toBeInTheDocument();
  const polls = (global.fetch as jest.Mock).mock.calls.length;
  await act(async () => { jest.advanceTimersByTime(10_000); });
  expect((global.fetch as jest.Mock).mock.calls.length).toBe(polls);
  expect(onSuccess).not.toHaveBeenCalled();

  // The payment went through, so the member may close the dialog now.
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalled();
});

it("finishes the join when the server says the user is already a member", async () => {
  mockFetch({
    "/promo-codes/validate": { body: { valid: true, promotionCodeId: "promo_1", preview: { label: "20% off" } } },
    "/join-paid": { status: 409, body: { error: "You're already a member of this community.", alreadyMember: true } },
  });
  const { onSuccess } = renderModal();

  await userEvent.click(await screen.findByRole("button", { name: "Do you have a promo code?" }));
  await userEvent.type(screen.getByPlaceholderText("Enter code"), "SAVE20");
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));

  await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  expect(toast.error).not.toHaveBeenCalled();
});
