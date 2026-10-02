/**
 * The verification step reads the status route's real field names, shows
 * what Stripe still needs, and only says the account is ready to accept
 * payments when both charges and payouts are enabled.
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VerificationStep } from "@/components/stripe-onboarding/steps/VerificationStep";

jest.mock("react-hot-toast", () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() });
  return { __esModule: true, toast: t, default: t };
});

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

const req = (code: string, message: string, category = "personal") => ({ code, message, category });

function status(overrides: Record<string, unknown> = {}, requirements: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: true,
        ...overrides,
        requirements: {
          currentlyDue: [],
          pastDue: [],
          eventuallyDue: [],
          pendingVerification: [],
          disabledReason: null,
          errors: [],
          ...requirements,
        },
      }),
  };
}

function renderStep(accountId: string | null = "acct_1", onFinish = jest.fn().mockResolvedValue(true)) {
  render(
    <VerificationStep
      data={{ accountId: accountId ?? undefined, businessInfo: {}, personalInfo: {}, documents: [] }}
      onPrevious={jest.fn()}
      onFinish={onFinish}
      isLoading={false}
    />
  );
  return { onFinish };
}

const finishButton = () => screen.getByRole("button", { name: /Complete Setup/ });

it("says ready to accept payments only when charges and payouts are enabled", async () => {
  fetchMock.mockResolvedValue(status({ charges_enabled: true, payouts_enabled: true }));
  renderStep();

  expect(await screen.findByText("Verification complete")).toBeInTheDocument();
  expect(screen.getByText(/ready to accept payments/)).toBeInTheDocument();
  expect(finishButton()).toBeEnabled();
});

it("does not call an account with charges but no payouts complete", async () => {
  fetchMock.mockResolvedValue(status({ charges_enabled: true, payouts_enabled: false }));
  renderStep();

  expect(await screen.findByText("Verification in progress")).toBeInTheDocument();
  expect(screen.queryByText(/ready to accept payments/)).not.toBeInTheDocument();
});

it("lists what is still needed and blocks finishing", async () => {
  fetchMock.mockResolvedValue(
    status({}, {
      currentlyDue: [req("individual.verification.document", "Government-issued photo ID required")],
      pastDue: [req("individual.dob.day", "Date of birth required")],
    })
  );
  renderStep();

  expect(await screen.findByText("More information needed")).toBeInTheDocument();
  expect(screen.getByText("Government-issued photo ID required")).toBeInTheDocument();
  expect(screen.getByText("Date of birth required")).toBeInTheDocument();
  expect(screen.getByText(/hello@dance-hub\.io/)).toBeInTheDocument();
  expect(screen.queryByText(/ready to accept payments/)).not.toBeInTheDocument();
  expect(finishButton()).toBeDisabled();
});

it("shows what is being reviewed and why a document was rejected", async () => {
  fetchMock.mockResolvedValue(
    status({}, {
      pendingVerification: [req("individual.verification.document", "Government-issued photo ID required")],
      errors: [{ code: "individual.address.line1", reason: "The address could not be verified." }],
    })
  );
  renderStep();

  expect(await screen.findByText("Verification in progress")).toBeInTheDocument();
  const reviewed = screen.getByRole("region", { name: "Being reviewed" });
  expect(within(reviewed).getByText("Government-issued photo ID required")).toBeInTheDocument();
  // A rejection reason is something to fix, not something under review.
  expect(within(reviewed).queryByText("The address could not be verified.")).not.toBeInTheDocument();
  const toFix = screen.getByRole("region", { name: "Needs fixing" });
  expect(within(toFix).getByText("The address could not be verified.")).toBeInTheDocument();
  expect(finishButton()).toBeEnabled();
});

it("does not call an account complete before its details are submitted", async () => {
  // /verify requires details_submitted too; otherwise finishing would fail
  // with nothing listed to fix.
  fetchMock.mockResolvedValue(status({ charges_enabled: true, payouts_enabled: true, details_submitted: false }));
  renderStep();

  expect(await screen.findByText("Verification in progress")).toBeInTheDocument();
  expect(screen.queryByText(/ready to accept payments/)).not.toBeInTheDocument();
});

it("tells the owner when the account was rejected", async () => {
  fetchMock.mockResolvedValue(status({}, { disabledReason: "rejected.other" }));
  renderStep();

  expect(await screen.findByText("We couldn't verify your account")).toBeInTheDocument();
  expect(screen.getByText(/hello@dance-hub\.io/)).toBeInTheDocument();
  expect(finishButton()).toBeDisabled();
});

it("refreshes the status on demand", async () => {
  fetchMock
    .mockResolvedValueOnce(status({}, { currentlyDue: [req("external_account", "Bank account information required", "banking")] }))
    .mockResolvedValueOnce(status({ charges_enabled: true, payouts_enabled: true }));
  renderStep();

  await screen.findByText("More information needed");
  await userEvent.click(screen.getByRole("button", { name: /Refresh status/i }));

  expect(await screen.findByText("Verification complete")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("offers a retry when the status can't be loaded", async () => {
  fetchMock
    .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ error: "boom" }) })
    .mockResolvedValueOnce(status({ charges_enabled: true, payouts_enabled: true }));
  renderStep();

  expect(await screen.findByText("We couldn't check your status")).toBeInTheDocument();
  expect(screen.queryByText(/ready to accept payments/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Refresh status/i }));
  expect(await screen.findByText("Verification complete")).toBeInTheDocument();
});

it("does not spin forever without an account", async () => {
  renderStep(null);

  expect(await screen.findByText(/couldn't find your payout account/)).toBeInTheDocument();
  expect(screen.queryByText(/Checking/)).not.toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("re-checks the status when finishing did not complete", async () => {
  fetchMock.mockResolvedValue(status({ charges_enabled: true, payouts_enabled: true }));
  const { onFinish } = renderStep("acct_1", jest.fn().mockResolvedValue(false));

  await screen.findByText("Verification complete");
  await userEvent.click(finishButton());

  expect(onFinish).toHaveBeenCalled();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
});

it("waits while the wizard is still loading the account", async () => {
  render(
    <VerificationStep
      data={{ accountId: undefined, businessInfo: {}, personalInfo: {}, documents: [] }}
      onPrevious={jest.fn()}
      onFinish={jest.fn()}
      accountLookup="loading"
      isLoading={false}
    />
  );

  expect(screen.getByText("Checking your verification status")).toBeInTheDocument();
  expect(screen.queryByText(/couldn't find your payout account/)).not.toBeInTheDocument();
  expect(finishButton()).toBeDisabled();
});

it("says when the wizard could not load the account", () => {
  render(
    <VerificationStep
      data={{ accountId: undefined, businessInfo: {}, personalInfo: {}, documents: [] }}
      onPrevious={jest.fn()}
      onFinish={jest.fn()}
      accountLookup="failed"
      isLoading={false}
    />
  );

  expect(screen.getByText(/couldn't load your payout account/)).toBeInTheDocument();
  expect(finishButton()).toBeDisabled();
});
