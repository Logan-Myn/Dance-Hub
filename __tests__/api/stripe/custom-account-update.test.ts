/**
 * custom-account/[accountId]/update
 * - bank_account: fields and currency come from the Stripe account's country,
 *   the new bank account becomes the default and replaces the old ones.
 */
import { PUT } from '@/app/api/stripe/custom-account/[accountId]/update/route';

const mockRetrieve = jest.fn();
const mockUpdate = jest.fn();
const mockCreateExternal = jest.fn();
const mockListExternal = jest.fn();
const mockDeleteExternal = jest.fn();
const mockListPersons = jest.fn();
const mockCreatePerson = jest.fn();
const mockUpdatePerson = jest.fn();
jest.mock('@/lib/stripe', () => ({
  stripe: {
    accounts: {
      retrieve: (...a: unknown[]) => mockRetrieve(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
      createExternalAccount: (...a: unknown[]) => mockCreateExternal(...a),
      listExternalAccounts: (...a: unknown[]) => mockListExternal(...a),
      deleteExternalAccount: (...a: unknown[]) => mockDeleteExternal(...a),
      listPersons: (...a: unknown[]) => mockListPersons(...a),
      createPerson: (...a: unknown[]) => mockCreatePerson(...a),
      updatePerson: (...a: unknown[]) => mockUpdatePerson(...a),
    },
  },
}));

const mockSql = jest.fn();
jest.mock('@/lib/db', () => {
  const sql = Object.assign((...a: unknown[]) => mockSql(...a), { json: (v: unknown) => ({ __json: v }) });
  return { sql };
});

jest.mock('@/lib/community-auth', () => ({
  requireStripeAccountManager: jest.fn().mockResolvedValue({ ok: true }),
}));

const params = { params: Promise.resolve({ accountId: 'acct_1' }) };

function put(body: object, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/stripe/custom-account/acct_1/update', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function account(overrides: object = {}) {
  return {
    id: 'acct_1',
    country: 'SE',
    business_type: 'individual',
    metadata: { community_id: 'c1' },
    requirements: {},
    ...overrides,
  };
}

/** jsonb values written to stripe_onboarding_progress. */
const progressJsonWrites = () =>
  mockSql.mock.calls.flatMap((c) => c.slice(1)).filter((v) => v && typeof v === 'object' && '__json' in v)
    .map((v) => (v as { __json: unknown }).__json);

beforeEach(() => {
  jest.clearAllMocks();
  mockRetrieve.mockResolvedValue(account());
  mockUpdate.mockResolvedValue({});
  mockSql.mockResolvedValue([]);
  mockCreateExternal.mockResolvedValue({ id: 'ba_new', object: 'bank_account', last4: '0003', currency: 'sek' });
  mockListExternal.mockResolvedValue({
    data: [
      { id: 'ba_old', object: 'bank_account' },
      { id: 'ba_new', object: 'bank_account' },
    ],
  });
  mockDeleteExternal.mockResolvedValue({ deleted: true });
});

describe('bank_account', () => {
  it('uses the account country for the bank country and currency, not what the browser sends', async () => {
    const res = await PUT(
      put({
        step: 'bank_account',
        bankAccount: {
          account_holder_name: 'Ana Lopez',
          country: 'EE',
          currency: 'eur',
          fields: { iban: 'SE35 5000 0000 0549 1000 0003' },
        },
      }),
      params
    );

    expect(res.status).toBe(200);
    expect(mockCreateExternal).toHaveBeenCalledWith('acct_1', {
      external_account: {
        object: 'bank_account',
        country: 'SE',
        currency: 'sek',
        account_holder_name: 'Ana Lopez',
        account_holder_type: 'individual',
        account_number: 'SE3550000000054910000003',
      },
      default_for_currency: true,
    });
  });

  it('sends US routing and account numbers in USD', async () => {
    mockRetrieve.mockResolvedValue(account({ country: 'US' }));

    const res = await PUT(
      put({
        step: 'bank_account',
        bankAccount: {
          account_holder_name: 'Ana Lopez',
          fields: { routingNumber: '110000000', accountNumber: '000123456789' },
        },
      }),
      params
    );

    expect(res.status).toBe(200);
    expect(mockCreateExternal.mock.calls[0][1].external_account).toMatchObject({
      country: 'US',
      currency: 'usd',
      routing_number: '110000000',
      account_number: '000123456789',
    });
  });

  it('marks a company bank account as a company account', async () => {
    mockRetrieve.mockResolvedValue(account({ country: 'EE', business_type: 'company' }));

    await PUT(
      put({
        step: 'bank_account',
        bankAccount: { account_holder_name: 'Salsa OÜ', fields: { iban: 'EE382200221020145685' } },
      }),
      params
    );

    expect(mockCreateExternal.mock.calls[0][1].external_account.account_holder_type).toBe('company');
  });

  it('rejects invalid bank details without calling Stripe', async () => {
    mockRetrieve.mockResolvedValue(account({ country: 'EE' }));

    const res = await PUT(
      put({
        step: 'bank_account',
        bankAccount: { account_holder_name: 'Ana', fields: { iban: 'EE382200221020145686' } },
      }),
      params
    );

    expect(res.status).toBe(400);
    expect((await res.json()).fieldErrors.iban).toBeTruthy();
    expect(mockCreateExternal).not.toHaveBeenCalled();
  });

  it('tells owners in unsupported countries to contact us', async () => {
    mockRetrieve.mockResolvedValue(account({ country: 'JP' }));

    const res = await PUT(
      put({
        step: 'bank_account',
        bankAccount: { account_holder_name: 'Ana', fields: { accountNumber: '1234567' } },
      }),
      params
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('hello@dance-hub.io');
    expect(mockCreateExternal).not.toHaveBeenCalled();
  });

  it('makes the new account the default and removes the previous one', async () => {
    const res = await PUT(
      put({
        step: 'bank_account',
        bankAccount: { account_holder_name: 'Ana', fields: { iban: 'SE3550000000054910000003' } },
      }),
      params
    );

    expect(res.status).toBe(200);
    expect(mockCreateExternal.mock.calls[0][1].default_for_currency).toBe(true);
    expect(mockDeleteExternal).toHaveBeenCalledTimes(1);
    expect(mockDeleteExternal).toHaveBeenCalledWith('acct_1', 'ba_old');
  });

  it('still succeeds when the old account cannot be removed', async () => {
    mockDeleteExternal.mockRejectedValue(new Error('cannot delete'));

    const res = await PUT(
      put({
        step: 'bank_account',
        bankAccount: { account_holder_name: 'Ana', fields: { iban: 'SE3550000000054910000003' } },
      }),
      params
    );

    expect(res.status).toBe(200);
  });

  it('leaves the old account alone when the new one is rejected', async () => {
    mockCreateExternal.mockRejectedValue(
      Object.assign(new Error('The IBAN you provided is invalid.'), { type: 'StripeInvalidRequestError' })
    );

    const res = await PUT(
      put({
        step: 'bank_account',
        bankAccount: { account_holder_name: 'Ana', fields: { iban: 'SE3550000000054910000003' } },
      }),
      params
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('The IBAN you provided is invalid.');
    expect(mockListExternal).not.toHaveBeenCalled();
    expect(mockDeleteExternal).not.toHaveBeenCalled();
  });

  it('stores only the last 4 digits in onboarding progress', async () => {
    await PUT(
      put({
        step: 'bank_account',
        bankAccount: { account_holder_name: 'Ana', fields: { iban: 'SE3550000000054910000003' } },
      }),
      params
    );

    const written = JSON.stringify(progressJsonWrites());
    expect(written).toContain('0003');
    expect(written).not.toContain('SE3550000000054910000003');
  });
});
