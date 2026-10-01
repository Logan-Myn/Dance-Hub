// A connected account is "gone" when Stripe says it no longer exists for this
// platform: deleted, never created in this mode, or the connection was revoked.
// Retrieving such an account fails with resource_missing (404) or with a 403
// "does not have access to account ... (or that account does not exist)".
// Anything else (network failures, rate limits, Stripe outages, a bad or
// restricted API key) says nothing about the account and must not be treated
// as "the account is gone".
const NO_ACCESS_TO_ACCOUNT = /does not have access to account|access may have been revoked|account does not exist/i;

export function isConnectedAccountGone(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { type?: string; code?: string; statusCode?: number; message?: string };

  if (e.code === 'resource_missing' || e.code === 'account_invalid') return true;
  if (e.type === 'StripePermissionError' || e.statusCode === 403) {
    return NO_ACCESS_TO_ACCOUNT.test(e.message ?? '');
  }
  return false;
}
