/**
 * The onboarding wizard keeps only its step position in localStorage, never
 * the bank, identity or address details typed into it. A blob saved by the
 * old wizard is cleaned on load, and the saved step is never one behind.
 *
 * Finishing calls /verify, checks the response, and only completes when the
 * account is verified or submitted and under review.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { toast } from "react-hot-toast";
import userEvent from "@testing-library/user-event";
import { OnboardingWizard } from "@/components/stripe-onboarding/OnboardingWizard";

jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, session: { id: "s1" } }) }));
jest.mock("react-hot-toast", () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() });
  return { __esModule: true, toast: t, default: t };
});

// Each step is a stub that can push data up and move on.
type StepProps = { updateData: (d: object) => void; onNext: () => void; onFinish?: () => void };
jest.mock("@/components/stripe-onboarding/steps/BusinessInfoStep", () => ({
  BusinessInfoStep: ({ updateData, onNext }: StepProps) => (
    <div>
      <p>business step</p>
      <button
        onClick={() =>
          updateData({
            businessInfo: {
              businessType: "individual",
              legalBusinessName: "Ana Lopez",
              businessAddress: { line1: "Secret street 1", city: "Tallinn", state: "Harju", postalCode: "10117", country: "EE" },
              businessPhone: "+3725550000",
              mccCode: "8299",
            },
          })
        }
      >
        fill business
      </button>
      <button onClick={onNext}>next</button>
    </div>
  ),
}));
jest.mock("@/components/stripe-onboarding/steps/PersonalInfoStep", () => ({
  PersonalInfoStep: ({ updateData, onNext }: StepProps) => (
    <div>
      <p>personal step</p>
      <button
        onClick={() =>
          updateData({
            personalInfo: {
              firstName: "Ana",
              lastName: "Lopez",
              dateOfBirth: { day: 17, month: 3, year: 1987 },
              address: { line1: "Secret street 1", city: "Tallinn", state: "Harju", postalCode: "10117", country: "EE" },
              phone: "+3725550000",
              email: "ana@example.com",
              ssnLast4: "9876",
            },
          })
        }
      >
        fill personal
      </button>
      <button onClick={onNext}>next</button>
    </div>
  ),
}));
jest.mock("@/components/stripe-onboarding/steps/BankAccountStep", () => ({
  BankAccountStep: ({
    onNext,
    data,
    accountLookup,
  }: StepProps & { data: { accountCountry?: string; accountCurrency?: string }; accountLookup?: string }) => (
    <div>
      <p>bank step</p>
      <p>
        account: {data.accountCountry ?? "-"} {data.accountCurrency ?? "-"} {accountLookup}
      </p>
      <button onClick={onNext}>next</button>
    </div>
  ),
}));
jest.mock("@/components/stripe-onboarding/steps/DocumentUploadStep", () => ({
  DocumentUploadStep: ({ onNext }: StepProps) => (
    <div>
      <p>document step</p>
      <button onClick={onNext}>next</button>
    </div>
  ),
}));
jest.mock("@/components/stripe-onboarding/steps/VerificationStep", () => {
  const React = require("react");
  return {
    VerificationStep: ({ onFinish }: { onFinish: () => Promise<boolean> }) => {
      const [result, setResult] = React.useState("");
      return (
        <div>
          <p>verification step</p>
          <button onClick={async () => setResult(String(await onFinish()))}>finish</button>
          <p>finished: {result}</p>
        </div>
      );
    },
  };
});

const KEY = "stripe-onboarding-c1";
const SENSITIVE = ["Secret street", "+3725550000", "9876", "1987", "EE382200221020145685", "000123456789", "110000000"];

function stored(): string {
  return window.localStorage.getItem(KEY) ?? "";
}

beforeEach(() => {
  window.localStorage.clear();
  // No linked account: the wizard starts from scratch.
  global.fetch = jest.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }) as unknown as typeof fetch;
});

function renderWizard() {
  return render(<OnboardingWizard communityId="c1" communitySlug="salsa" onComplete={jest.fn()} />);
}

it("never writes typed personal or bank details to localStorage", async () => {
  renderWizard();

  await userEvent.click(screen.getByText("fill business"));
  await userEvent.click(screen.getByText("next"));
  await screen.findByText("personal step");
  await userEvent.click(screen.getByText("fill personal"));
  await userEvent.click(screen.getByText("next"));
  await screen.findByText("bank step");

  await waitFor(() => expect(stored()).not.toBe(""));
  for (const value of SENSITIVE) expect(stored()).not.toContain(value);
  expect(stored()).not.toContain("Ana");
});

it("saves the step it is on, not the one before", async () => {
  renderWizard();

  await userEvent.click(screen.getByText("next"));
  await screen.findByText("personal step");

  await waitFor(() => expect(JSON.parse(stored())).toEqual({ currentStep: 2, completedSteps: [1] }));
});

it("restores the step and replaces an old blob that held personal data", async () => {
  window.localStorage.setItem(
    KEY,
    JSON.stringify({
      data: {
        accountId: "acct_1",
        personalInfo: { address: { line1: "Secret street 1" }, phone: "+3725550000", ssnLast4: "9876", dateOfBirth: { year: 1987 } },
        bankAccount: { iban: "EE382200221020145685", accountNumber: "000123456789", routingNumber: "110000000" },
      },
      currentStep: 3,
      completedSteps: [1, 2],
      timestamp: "2026-09-01T00:00:00.000Z",
    })
  );

  renderWizard();

  expect(await screen.findByText("bank step")).toBeInTheDocument();
  await waitFor(() => expect(JSON.parse(stored())).toEqual({ currentStep: 3, completedSteps: [1, 2] }));
  for (const value of SENSITIVE) expect(stored()).not.toContain(value);
});

it("drops a blob it cannot read", async () => {
  window.localStorage.setItem(KEY, "{not json");

  renderWizard();

  expect(await screen.findByText("business step")).toBeInTheDocument();
  await waitFor(() => expect(JSON.parse(stored())).toEqual({ currentStep: 1, completedSteps: [] }));
});

describe("finishing", () => {
  function setup(verifyResponse: { ok: boolean; body: object }) {
    window.localStorage.setItem(KEY, JSON.stringify({ currentStep: 5, completedSteps: [1, 2, 3, 4] }));
    const fetchMock = jest.fn((url: string) => {
      if (url === "/api/community/salsa") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ stripe_account_id: "acct_1" }) });
      }
      if (url === "/api/stripe/custom-account/acct_1/status") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ country: "EE" }) });
      }
      if (url === "/api/stripe/custom-account/acct_1/verify") {
        return Promise.resolve({ ok: verifyResponse.ok, json: () => Promise.resolve(verifyResponse.body) });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const onComplete = jest.fn();
    render(<OnboardingWizard communityId="c1" communitySlug="salsa" onComplete={onComplete} />);
    return { fetchMock, onComplete };
  }

  async function finish() {
    await screen.findByText("verification step");
    // Wait for the linked account to load.
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Loaded your payout account"));
    await userEvent.click(screen.getByText("finish"));
  }

  beforeEach(() => jest.clearAllMocks());

  it("completes when the account is verified", async () => {
    const { fetchMock, onComplete } = setup({ ok: true, body: { success: true, verified: true } });
    await finish();

    expect(await screen.findByText("finished: true")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/stripe/custom-account/acct_1/verify", { method: "POST" });
    expect(onComplete).toHaveBeenCalledWith("acct_1");
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("completes when everything is submitted and under review", async () => {
    const { onComplete } = setup({
      ok: true,
      body: { success: true, verified: false, status: "pending_review" },
    });
    await finish();

    expect(await screen.findByText("finished: true")).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalled();
  });

  it("stays on the step when information is still missing", async () => {
    const { onComplete } = setup({
      ok: true,
      body: { success: false, verified: false, requirements: { currentlyDue: ["external_account"] } },
    });
    await finish();

    expect(await screen.findByText("finished: false")).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("does not point at an empty list when /verify can't confirm the status", async () => {
    const { onComplete } = setup({
      ok: true,
      body: { success: false, verified: false, status: "unknown" },
    });
    await finish();

    expect(await screen.findByText("finished: false")).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/couldn't confirm/));
  });

  it("stays on the step when the check fails", async () => {
    const { onComplete } = setup({ ok: false, body: { error: "Failed to verify account" } });
    await finish();

    expect(await screen.findByText("finished: false")).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(KEY)).not.toBeNull();
  });
});

describe("reloading with a linked account", () => {
  function setup(statusResponse: { ok: boolean; body: object }) {
    window.localStorage.setItem(KEY, JSON.stringify({ currentStep: 3, completedSteps: [1, 2] }));
    global.fetch = jest.fn((url: string) => {
      if (url === "/api/community/salsa") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ stripe_account_id: "acct_1" }) });
      }
      if (url === "/api/stripe/custom-account/acct_1/status") {
        return Promise.resolve({ ok: statusResponse.ok, json: () => Promise.resolve(statusResponse.body) });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;
    render(<OnboardingWizard communityId="c1" communitySlug="salsa" onComplete={jest.fn()} />);
  }

  beforeEach(() => jest.clearAllMocks());

  it("passes the account's country and currency to the bank step", async () => {
    setup({ ok: true, body: { country: "EE", default_currency: "eur" } });
    expect(await screen.findByText("account: EE eur done")).toBeInTheDocument();
  });

  it("tells the bank step when the account could not be loaded", async () => {
    setup({ ok: false, body: { error: "boom" } });
    expect(await screen.findByText("account: - - failed")).toBeInTheDocument();
  });

  it("starts over from step 1 when the linked account is gone", async () => {
    setup({ ok: false, body: { error: "gone", code: "account_gone" } });

    expect(await screen.findByText("business step")).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/no longer available/));
    await waitFor(() => expect(JSON.parse(stored())).toEqual({ currentStep: 1, completedSteps: [] }));
  });
});
