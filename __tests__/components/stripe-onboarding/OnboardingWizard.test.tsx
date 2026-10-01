/**
 * The onboarding wizard keeps only its step position in localStorage, never
 * the bank, identity or address details typed into it. A blob saved by the
 * old wizard is cleaned on load, and the saved step is never one behind.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
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
  BankAccountStep: ({ onNext }: StepProps) => (
    <div>
      <p>bank step</p>
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
jest.mock("@/components/stripe-onboarding/steps/VerificationStep", () => ({
  VerificationStep: () => <p>verification step</p>,
}));

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
