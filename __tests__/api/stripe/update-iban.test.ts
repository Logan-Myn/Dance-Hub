/**
 * bank-account/[accountId]/update-iban replaces the payout bank account:
 * the IBAN goes in account_number (Stripe has no `iban` field), the currency
 * follows the account's country, the new account becomes the default and the
 * old ones are removed.
 */
import { POST } from '@/app/api/stripe/bank-account/[accountId]/update-iban/route';

const mockGetSession = jest.fn();
jest.mock('@/lib/auth-session', () => ({ getSession: () => mockGetSession() }));

const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({ queryOne: (...a: unknown[]) => mockQueryOne(...a) }));

const mockRetrieve = jest.fn();
const mockCreateExternal = jest.fn();
const mockListExternal = jest.fn();
const mockDeleteExternal = jest.fn();
const mockUpdateExternal = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    accounts: {
      retrieve: (...a: unknown[]) => mockRetrieve(...a),
      createExternalAccount: (...a: unknown[]) => mockCreateExternal(...a),
      listExternalAccounts: (...a: unknown[]) => mockListExternal(...a),
      deleteExternalAccount: (...a: unknown[]) => mockDeleteExternal(...a),
      updateExternalAccount: (...a: unknown[]) => mockUpdateExternal(...a),
    },
  },
}));

const params = { params: Promise.resolve({ accountId: 'acct_1' }) };
const post = (body: object) =>
  new Request('http://x/api/stripe/bank-account/acct_1/update-iban', {
    method: 'POST',
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: 'owner-1' } });
  mockQueryOne.mockResolvedValue({ id: 'c1', created_by: 'owner-1' });
  mockRetrieve.mockResolvedValue({ id: 'acct_1', type: 'custom', country: 'EE', business_type: 'individual' });
  mockCreateExternal.mockResolvedValue({ id: 'ba_new', object: 'bank_account', last4: '5685', currency: 'eur' });
  mockListExternal.mockResolvedValue({
    data: [
      { id: 'ba_old', object: 'bank_account', currency: 'eur', default_for_currency: true },
      { id: 'ba_new', object: 'bank_account', currency: 'eur' },
    ],
  });
  mockDeleteExternal.mockResolvedValue({ deleted: true });
});

it('sends the IBAN as the account number, makes it the default and removes the old account', async () => {
  const res = await POST(post({ iban: 'EE38 2200 2210 2014 5685', accountHolderName: 'Ana Lopez' }), params);

  expect(res.status).toBe(200);
  expect(mockCreateExternal).toHaveBeenCalledWith('acct_1', {
    external_account: {
      object: 'bank_account',
      country: 'EE',
      currency: 'eur',
      account_holder_name: 'Ana Lopez',
      account_holder_type: 'individual',
      account_number: 'EE382200221020145685',
    },
    default_for_currency: true,
  });
  expect(mockDeleteExternal).toHaveBeenCalledWith('acct_1', 'ba_old');
  expect(mockDeleteExternal).not.toHaveBeenCalledWith('acct_1', 'ba_new');
});

it('uses the local currency for non-euro IBAN countries', async () => {
  mockRetrieve.mockResolvedValue({ id: 'acct_1', type: 'custom', country: 'CH', business_type: 'individual' });

  const res = await POST(post({ iban: 'CH9300762011623852957', accountHolderName: 'Ana' }), params);

  expect(res.status).toBe(200);
  expect(mockCreateExternal.mock.calls[0][1].external_account.currency).toBe('chf');
});

it('rejects an invalid IBAN before calling Stripe', async () => {
  const res = await POST(post({ iban: 'EE382200221020145686', accountHolderName: 'Ana' }), params);

  expect(res.status).toBe(400);
  expect(mockCreateExternal).not.toHaveBeenCalled();
});

it('refuses an IBAN for a country whose banks do not use one', async () => {
  mockRetrieve.mockResolvedValue({ id: 'acct_1', type: 'custom', country: 'US', business_type: 'individual' });

  const res = await POST(post({ iban: 'EE382200221020145685', accountHolderName: 'Ana' }), params);

  expect(res.status).toBe(400);
  expect((await res.json()).error).toContain('hello@dance-hub.io');
  expect(mockCreateExternal).not.toHaveBeenCalled();
});
