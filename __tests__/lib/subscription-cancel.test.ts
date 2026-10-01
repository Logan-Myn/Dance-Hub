/**
 * Cancelling a subscription before its member row (or community, or user)
 * is deleted. "Already gone" counts as done; anything else must stop the
 * delete, or the member keeps being charged with nothing left to cancel.
 *
 * @jest-environment node
 */
import { cancelMemberSubscriptions, cancelSubscriptionNow, isMissingStripeResource } from '@/lib/subscription-cancel';

const mockCancel = jest.fn();
const mockRetrieve = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    subscriptions: {
      cancel: (...a: unknown[]) => mockCancel(...a),
      retrieve: (...a: unknown[]) => mockRetrieve(...a),
    },
  },
}));
jest.mock('@/lib/db', () => ({ sql: jest.fn() }));

const missing = Object.assign(new Error('No such subscription'), { code: 'resource_missing', statusCode: 404 });

beforeEach(() => {
  mockCancel.mockReset();
  mockRetrieve.mockReset();
});

it('cancels on the connected account', async () => {
  mockCancel.mockResolvedValueOnce({ id: 'sub_1', status: 'canceled' });
  await cancelSubscriptionNow('sub_1', 'acct_1');
  expect(mockCancel).toHaveBeenCalledWith('sub_1', { stripeAccount: 'acct_1' });
});

it('cancels on the platform account when no connected account is given', async () => {
  mockCancel.mockResolvedValueOnce({ id: 'sub_b', status: 'canceled' });
  await cancelSubscriptionNow('sub_b', null);
  expect(mockCancel).toHaveBeenCalledWith('sub_b');
});

it('treats a subscription that no longer exists as cancelled', async () => {
  mockCancel.mockRejectedValueOnce(missing);
  await expect(cancelSubscriptionNow('sub_1', 'acct_1')).resolves.toBeUndefined();
});

it('treats an already-cancelled subscription as cancelled', async () => {
  mockCancel.mockRejectedValueOnce(Object.assign(new Error('already canceled'), { statusCode: 400 }));
  mockRetrieve.mockResolvedValueOnce({ id: 'sub_1', status: 'canceled' });
  await expect(cancelSubscriptionNow('sub_1', 'acct_1')).resolves.toBeUndefined();
  expect(mockRetrieve).toHaveBeenCalledWith('sub_1', { stripeAccount: 'acct_1' });
});

it('throws when the subscription is still live after a failed cancel', async () => {
  const err = Object.assign(new Error('rate limited'), { statusCode: 429 });
  mockCancel.mockRejectedValueOnce(err);
  mockRetrieve.mockResolvedValueOnce({ id: 'sub_1', status: 'active' });
  await expect(cancelSubscriptionNow('sub_1', 'acct_1')).rejects.toBe(err);
});

it('throws when Stripe cannot be reached at all', async () => {
  const err = Object.assign(new Error('connection error'), { type: 'StripeConnectionError' });
  mockCancel.mockRejectedValueOnce(err);
  mockRetrieve.mockRejectedValueOnce(err);
  await expect(cancelSubscriptionNow('sub_1', 'acct_1')).rejects.toBe(err);
});

it('recognises missing-object errors', () => {
  expect(isMissingStripeResource(missing)).toBe(true);
  expect(isMissingStripeResource(new Error('boom'))).toBe(false);
  expect(isMissingStripeResource(null)).toBe(false);
});

describe('cancelMemberSubscriptions', () => {
  it('cancels each live membership subscription on its community account', async () => {
    mockCancel.mockResolvedValue({ status: 'canceled' });

    const failed = await cancelMemberSubscriptions([
      { stripe_subscription_id: 'sub_a', subscription_status: 'active', stripe_account_id: 'acct_1' },
      { stripe_subscription_id: 'sub_b', subscription_status: 'canceling', stripe_account_id: 'acct_2' },
      { stripe_subscription_id: 'sub_c', subscription_status: null, stripe_account_id: 'acct_1' },
    ]);

    expect(failed).toEqual([]);
    expect(mockCancel).toHaveBeenCalledWith('sub_a', { stripeAccount: 'acct_1' });
    expect(mockCancel).toHaveBeenCalledWith('sub_b', { stripeAccount: 'acct_2' });
    expect(mockCancel).toHaveBeenCalledWith('sub_c', { stripeAccount: 'acct_1' });
  });

  it('skips free members and subscriptions that already ended', async () => {
    const failed = await cancelMemberSubscriptions([
      { stripe_subscription_id: null, subscription_status: null, stripe_account_id: 'acct_1' },
      { stripe_subscription_id: 'sub_x', subscription_status: 'canceled', stripe_account_id: 'acct_1' },
      { stripe_subscription_id: 'sub_y', subscription_status: 'incomplete_expired', stripe_account_id: 'acct_1' },
    ]);

    expect(failed).toEqual([]);
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('reports the ones it could not cancel, and keeps going', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCancel
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { statusCode: 429 }))
      .mockResolvedValueOnce({ status: 'canceled' });
    mockRetrieve.mockResolvedValueOnce({ status: 'active' });

    const failed = await cancelMemberSubscriptions([
      { stripe_subscription_id: 'sub_a', subscription_status: 'active', stripe_account_id: 'acct_1' },
      { stripe_subscription_id: 'sub_b', subscription_status: 'active', stripe_account_id: 'acct_1' },
    ]);

    expect(failed).toEqual(['sub_a']);
    expect(mockCancel).toHaveBeenCalledTimes(2);
  });

  it('counts a subscription with no connected account to cancel it on as a failure', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const failed = await cancelMemberSubscriptions([
      { stripe_subscription_id: 'sub_a', subscription_status: 'active', stripe_account_id: null },
    ]);

    expect(failed).toEqual(['sub_a']);
    expect(mockCancel).not.toHaveBeenCalled();
  });
});
