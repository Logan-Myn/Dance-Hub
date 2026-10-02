import Stripe from 'stripe';

// A connected account is "gone" when Stripe says it no longer exists for this
// platform: deleted, never created in this mode, or the connection was revoked.
// Retrieving such an account fails with resource_missing (404) or with a 403
// "does not have access to account ... (or that account does not exist)".
// Anything else (network failures, rate limits, Stripe outages, a bad or
// restricted API key) says nothing about the account and must not be treated
// as "the account is gone".
const NO_ACCESS_TO_ACCOUNT = /does not have access to account|access may have been revoked|account does not exist/i;

export function isLiveStripeKey(key: string | undefined = process.env.STRIPE_SECRET_KEY): boolean {
  return /^(sk|rk)_live_/.test(key ?? '');
}

/**
 * On a live key only resource_missing counts. A 403 "no access" there is
 * more likely a misconfigured key (a test key in production would make
 * every live account look like this) than a lost account, and unlinking
 * live communities is much worse than a 502. Test mode keeps the 403 case,
 * which preprod relies on when it swaps between test and live keys.
 */
export function isConnectedAccountGone(
  error: unknown,
  { liveMode = isLiveStripeKey() }: { liveMode?: boolean } = {}
): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { type?: string; code?: string; statusCode?: number; message?: string };

  if (e.code === 'resource_missing') return true;
  if (liveMode) return false;
  if (e.code === 'account_invalid') return true;
  if (e.type === 'StripePermissionError' || e.statusCode === 403) {
    return NO_ACCESS_TO_ACCOUNT.test(e.message ?? '');
  }
  return false;
}

/**
 * A safe reply for an error thrown by a Stripe call, or null if it isn't a
 * Stripe error. Requests Stripe rejects (bad bank details, unsupported
 * country) pass Stripe's message on, since the owner can act on it; outages,
 * network and key problems get a generic retry message.
 */
export function stripeErrorReply(error: unknown): { status: number; error: string } | null {
  if (!(error instanceof Stripe.errors.StripeError)) return null;
  if (
    error instanceof Stripe.errors.StripeInvalidRequestError ||
    error instanceof Stripe.errors.StripeCardError
  ) {
    return { status: 400, error: error.message };
  }
  return { status: 502, error: 'We could not reach the payment provider. Please try again in a moment.' };
}
