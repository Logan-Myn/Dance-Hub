/**
 * The bank step shows the fields for the payout account's country (not the
 * owner's home address), and owners in countries the form can't handle get
 * a contact message instead of a broken IBAN field.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BankAccountStep } from "@/components/stripe-onboarding/steps/BankAccountStep";

jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ session: { id: "s1" } }) }));
jest.mock("react-hot-toast", () => ({
  __esModule: true,
  toast: { success: jest.fn(), error: jest.fn() },
  default: { success: jest.fn(), error: jest.fn() },
}));

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });
  global.fetch = fetchMock as unknown as typeof fetch;
});

function renderStep(accountCountry: string | undefined, homeCountry = "US") {
  const onNext = jest.fn();
  render(
    <BankAccountStep
      data={{
        accountId: "acct_1",
        accountCountry,
        personalInfo: { firstName: "Ana", lastName: "Lopez", address: { country: homeCountry } },
        businessInfo: { businessType: "individual", businessAddress: { country: accountCountry ?? "EE" } },
      }}
      onNext={onNext}
      onPrevious={jest.fn()}
      isLoading={false}
    />
  );
  return { onNext };
}

it("asks for an IBAN in the account's currency, whatever the home address says", () => {
  renderStep("SE", "US");

  expect(screen.getByLabelText(/IBAN/)).toBeInTheDocument();
  expect(screen.queryByLabelText(/Routing number/)).not.toBeInTheDocument();
  expect(screen.getByText(/SEK/)).toBeInTheDocument();
});

it("asks for routing and account numbers for a US account", () => {
  renderStep("US", "EE");

  expect(screen.getByLabelText(/Routing number/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Account number/)).toBeInTheDocument();
  expect(screen.queryByLabelText(/IBAN/)).not.toBeInTheDocument();
});

it("lets GB owners switch from sort code to IBAN", async () => {
  renderStep("GB");

  expect(screen.getByLabelText(/Sort code/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /IBAN instead/i }));
  expect(screen.getByLabelText(/IBAN/)).toBeInTheDocument();
  expect(screen.queryByLabelText(/Sort code/)).not.toBeInTheDocument();
});

it("shows a contact message for countries the form can't handle", () => {
  renderStep("JP");

  expect(screen.getByText(/can't be set up here yet/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "hello@dance-hub.io" })).toHaveAttribute(
    "href",
    "mailto:hello@dance-hub.io"
  );
  expect(screen.queryByLabelText(/IBAN/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Continue/ })).not.toBeInTheDocument();
});

it("sends the entered fields and moves on", async () => {
  const { onNext } = renderStep("SE");

  await userEvent.type(screen.getByLabelText(/IBAN/), "SE35 5000 0000 0549 1000 0003");
  await userEvent.click(screen.getByRole("button", { name: /Continue/ }));

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/stripe/custom-account/acct_1/update");
  expect(JSON.parse(init.body)).toEqual({
    step: "bank_account",
    bankAccount: {
      account_holder_name: "Ana Lopez",
      fields: { iban: "SE3550000000054910000003" },
      use_iban: false,
    },
    currentStep: 3,
  });
  expect(onNext).toHaveBeenCalled();
});

it("shows the error for an invalid IBAN without sending it", async () => {
  renderStep("EE");

  await userEvent.type(screen.getByLabelText(/IBAN/), "EE382200221020145686");
  await userEvent.click(screen.getByRole("button", { name: /Continue/ }));

  expect(screen.getByText(/not valid/)).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});
