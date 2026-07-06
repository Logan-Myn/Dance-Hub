import React from "react";
import { render, screen } from "@testing-library/react";
import { SubscriptionsEditor } from "@/components/admin/SubscriptionsEditor";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ session: null }) }));

// Force the Stripe status island to treat the account as enabled so the
// membership settings (and our yearly block) render.
beforeAll(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ isEnabled: true, needsSetup: false, details: {} }) }),
  ) as any;
});

it("reveals yearly price + benefits inputs when the yearly toggle is on", async () => {
  render(
    <SubscriptionsEditor
      communityId="c1"
      communitySlug="salsa"
      initialStripeAccountId="acct_1"
      initialMembershipEnabled={true}
      initialMembershipPrice={20}
      initialYearlyEnabled={true}
      initialYearlyPrice={200}
      initialYearlyBenefits="2 months free."
      communityCreatedAt={new Date().toISOString()}
    />,
  );

  // The editor shows a loading spinner while the initial Stripe-status fetch is
  // in flight; findBy* waits for that async resolution so the membership (and
  // yearly) block mounts before we assert.
  expect(await screen.findByText(/Yearly Membership Price/)).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/2 months free plus one private class/)).toBeInTheDocument();
});
