/**
 * custom-account/create must only unlink a community's existing Stripe account
 * when Stripe says the account is gone. Network errors, rate limits and Stripe
 * outages keep the link and return 502. A new account id is only saved when
 * the community still has none, so two concurrent requests can't overwrite
 * each other.
 */
import Stripe from 'stripe';
import { POST } from '@/app/api/stripe/custom-account/create/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));

const mockSql = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({
  sql: (...a: unknown[]) => mockSql(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
}));

const mockRetrieve = jest.fn();
const mockCreate = jest.fn();
const mockDel = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    accounts: {
      retrieve: (...a: unknown[]) => mockRetrieve(...a),
      create: (...a: unknown[]) => mockCreate(...a),
      del: (...a: unknown[]) => mockDel(...a),
    },
  },
}));

const SESSION = { user: { id: 'owner-1' } };

function req(body: object = { communityId: 'c1', country: 'EE', businessType: 'individual' }) {
  return new Request('http://x/api/stripe/custom-account/create', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const text = (call: unknown[]) => (call[0] as string[]).join('?');
const sqlTexts = () => mockSql.mock.calls.map(text);
const queryOneTexts = () => mockQueryOne.mock.calls.map(text);

/** Community lookup returns `existing`; the guarded save returns `saved`. */
function setupDb(existing: string | null, saved: { id: string } | null = { id: 'c1' }) {
  mockQueryOne.mockImplementation((strings: string[]) => {
    const q = strings.join('?');
    if (q.includes('SELECT id, created_by, stripe_account_id')) {
      return Promise.resolve({ id: 'c1', created_by: 'owner-1', stripe_account_id: existing });
    }
    if (q.includes('UPDATE communities')) return Promise.resolve(saved);
    return Promise.resolve(null);
  });
}

beforeEach(() => {
  [mockGetSession, mockSql, mockQueryOne, mockRetrieve, mockCreate, mockDel].forEach((m) => m.mockReset());
  mockGetSession.mockResolvedValue(SESSION);
  mockSql.mockResolvedValue([]);
  mockCreate.mockResolvedValue({ id: 'acct_new', country: 'EE', business_type: 'individual' });
  mockDel.mockResolvedValue({ deleted: true });
});

describe('when the existing account cannot be checked', () => {
  const transientErrors: Array<[string, Error]> = [
    ['a network error', new Stripe.errors.StripeConnectionError({ type: 'api_error', message: 'socket hang up' })],
    ['a rate limit', new Stripe.errors.StripeRateLimitError({ type: 'rate_limit_error', message: 'Too many requests', statusCode: 429 })],
    ['a Stripe outage', new Stripe.errors.StripeAPIError({ type: 'api_error', message: 'Internal error', statusCode: 500 })],
    ['a bad API key', new Stripe.errors.StripeAuthenticationError({ type: 'authentication_error', message: 'Invalid API Key', statusCode: 401 })],
  ];

  it.each(transientErrors)('keeps the link and returns 502 on %s', async (_label, error) => {
    setupDb('acct_live');
    mockRetrieve.mockRejectedValue(error);

    const res = await POST(req());

    expect(res.status).toBe(502);
    expect(sqlTexts().some((q) => q.includes('stripe_account_id = NULL'))).toBe(false);
    expect(queryOneTexts().some((q) => q.includes('UPDATE communities'))).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('when Stripe says the account is gone', () => {
  const goneErrors: Array<[string, Error]> = [
    [
      'resource_missing',
      new Stripe.errors.StripeInvalidRequestError({
        type: 'invalid_request_error',
        message: 'No such account: acct_old',
        code: 'resource_missing',
        statusCode: 404,
      }),
    ],
    [
      'a revoked connection',
      new Stripe.errors.StripePermissionError({
        type: 'invalid_request_error',
        message:
          "The provided key 'sk_test_***' does not have access to account 'acct_old' (or that account does not exist). Application access may have been revoked.",
        statusCode: 403,
      }),
    ],
  ];

  it.each(goneErrors)('unlinks the old account and creates a new one on %s', async (_label, error) => {
    setupDb('acct_old');
    mockRetrieve.mockRejectedValue(error);

    const res = await POST(req());

    expect(res.status).toBe(200);
    expect((await res.json()).accountId).toBe('acct_new');

    // The clear is a compare-and-swap on the old id, so it can't wipe a newer link.
    const clearCall = mockSql.mock.calls.find((c) => text(c).includes('stripe_account_id = NULL'));
    expect(clearCall).toBeDefined();
    expect(text(clearCall!)).toMatch(/AND stripe_account_id = \?/);
    expect(clearCall!.slice(1)).toContain('acct_old');
    expect(mockCreate).toHaveBeenCalled();
  });
});

it('does not treat an unrelated permission error as a missing account', async () => {
  setupDb('acct_live');
  mockRetrieve.mockRejectedValue(
    new Stripe.errors.StripePermissionError({
      type: 'invalid_request_error',
      message: 'The provided key does not have the required permissions for this endpoint.',
      statusCode: 403,
    })
  );

  const res = await POST(req());

  expect(res.status).toBe(502);
  expect(sqlTexts().some((q) => q.includes('stripe_account_id = NULL'))).toBe(false);
  expect(mockCreate).not.toHaveBeenCalled();
});

it('reports an existing, valid account without creating another', async () => {
  setupDb('acct_live');
  mockRetrieve.mockResolvedValue({ id: 'acct_live' });

  const res = await POST(req());

  expect(res.status).toBe(400);
  expect((await res.json()).code).toBe('account_exists');
  expect(mockCreate).not.toHaveBeenCalled();
});

it('saves a new account id only while the community has none', async () => {
  setupDb(null);

  const res = await POST(req());

  expect(res.status).toBe(200);
  const save = mockQueryOne.mock.calls.find((c) => text(c).includes('UPDATE communities'));
  expect(save).toBeDefined();
  expect(text(save!)).toMatch(/stripe_account_id IS NULL/);
  expect(save!.slice(1)).toEqual(expect.arrayContaining(['acct_new', 'c1']));
  expect(mockDel).not.toHaveBeenCalled();
});

it('drops its own new account when a concurrent request linked one first', async () => {
  setupDb(null, null);

  const res = await POST(req());

  expect(res.status).toBe(400);
  expect((await res.json()).code).toBe('account_exists');
  expect(mockDel).toHaveBeenCalledWith('acct_new');
  // No onboarding-progress row for the discarded account.
  expect(sqlTexts().some((q) => q.includes('INSERT INTO stripe_onboarding_progress'))).toBe(false);
});
