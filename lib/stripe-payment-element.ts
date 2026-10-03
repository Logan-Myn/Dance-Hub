import type { StripePaymentElementOptions } from "@stripe/stripe-js";

// Options shared by our payment forms. Link (Stripe's saved-details
// checkout) is hidden: members pay with a card only. Stripe.js supports
// `wallets.link`, but the installed @stripe/stripe-js types predate it.
export const PAYMENT_ELEMENT_OPTIONS = {
  wallets: { link: "never" },
} as unknown as StripePaymentElementOptions;
