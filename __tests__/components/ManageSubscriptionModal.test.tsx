import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { ManageSubscriptionModal } from "@/components/community/ManageSubscriptionModal";

// Mock Stripe Elements — we only render the details view in these tests.
jest.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: any) => <>{children}</>,
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => null,
  useElements: () => null,
}));
jest.mock("@stripe/stripe-js", () => ({
  loadStripe: () => Promise.resolve(null),
}));

const summaryFixture = {
  status: "active",
  currency: "eur",
  amount: 2500,
  interval: "month",
  currentPeriodEnd: 1750000000,
  defaultPaymentMethod: { brand: "visa", last4: "4242" },
  upgrade: null,
};

const paymentsFixture = {
  invoices: [
    {
      id: "in_1",
      paidAt: 1747000000,
      amount: 2500,
      currency: "eur",
      hostedInvoiceUrl: "https://example.test/inv",
    },
  ],
};

const mockFetch = (responses: Record<string, any>) => {
  global.fetch = jest.fn((url: any) => {
    const key = String(url);
    const match = Object.keys(responses).find((k) => key.endsWith(k));
    if (!match) {
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(responses[match]),
    });
  }) as any;
};

describe("ManageSubscriptionModal", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("renders plan, next charge, current card, and recent payments", async () => {
    mockFetch({
      "/subscription": summaryFixture,
      "/subscription/payments": paymentsFixture,
    });

    render(
      <ManageSubscriptionModal
        isOpen={true}
        onClose={() => {}}
        communitySlug="test"
        stripeAccountId="acct_test"
      />
    );

    await waitFor(() =>
      expect(screen.getByText(/Monthly/)).toBeInTheDocument()
    );
    // €25.00 appears in both the Plan section and the Recent payments row.
    // Use getAllByText since the exact non-breaking-space rendering varies.
    expect(screen.getAllByText(/€\s*25\.00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Visa •••• 4242/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Receipt/ })).toHaveAttribute(
      "href",
      "https://example.test/inv"
    );
  });

  it("shows past_due banner when status is past_due", async () => {
    mockFetch({
      "/subscription": { ...summaryFixture, status: "past_due" },
      "/subscription/payments": { invoices: [] },
    });

    render(
      <ManageSubscriptionModal
        isOpen={true}
        onClose={() => {}}
        communitySlug="test"
        stripeAccountId="acct_test"
      />
    );

    await waitFor(() =>
      expect(
        screen.getByText(/Your last payment did not go through/)
      ).toBeInTheDocument()
    );
  });

  it("offers a yearly switch for a monthly member when yearly is available", async () => {
    mockFetch({
      "/subscription": {
        ...summaryFixture,
        interval: "month",
        upgrade: { available: true, yearlyAmount: 20000, yearlyBenefits: "2 months free." },
      },
      "/subscription/payments": { invoices: [] },
    });

    render(
      <ManageSubscriptionModal isOpen={true} onClose={() => {}} communitySlug="test" stripeAccountId="acct_test" />
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /Switch to yearly/ })).toBeInTheDocument());
    expect(screen.getByText(/2 months free\./)).toBeInTheDocument();
  });

  it("shows error when summary fetch fails", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
    ) as any;

    render(
      <ManageSubscriptionModal
        isOpen={true}
        onClose={() => {}}
        communitySlug="test"
        stripeAccountId="acct_test"
      />
    );

    await waitFor(() =>
      expect(
        screen.getByText(/Could not load subscription details/)
      ).toBeInTheDocument()
    );
  });
});
