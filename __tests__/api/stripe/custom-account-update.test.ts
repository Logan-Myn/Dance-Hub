/**
 * custom-account/[accountId]/update
 * - bank_account: fields and currency come from the Stripe account's country,
 *   the new bank account becomes the default and replaces the old ones.
 * - business_info: one merged object per entity (company name and address
 *   both kept), business phone passed on, ToS date from the server clock and
 *   user agent from the request header.
 * - personal_info: company accounts get a representative person instead of
 *   `individual` fields.
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
      { id: 'ba_old', object: 'bank_account', currency: 'sek' },
      { id: 'ba_new', object: 'bank_account', currency: 'sek' },
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

  it('still succeeds when the old account cannot be removed, and says so', async () => {
    mockDeleteExternal.mockRejectedValue(new Error('cannot delete'));

    const res = await PUT(
      put({
        step: 'bank_account',
        bankAccount: { account_holder_name: 'Ana', fields: { iban: 'SE3550000000054910000003' } },
      }),
      params
    );

    expect(res.status).toBe(200);
    expect((await res.json()).warning).toMatch(/previous bank account couldn't be removed/);
  });

  it('only removes old bank accounts in the same currency', async () => {
    mockListExternal.mockResolvedValue({
      data: [
        { id: 'ba_old', object: 'bank_account', currency: 'sek' },
        { id: 'ba_usd', object: 'bank_account', currency: 'usd' },
        { id: 'ba_new', object: 'bank_account', currency: 'sek' },
      ],
    });

    const res = await PUT(
      put({
        step: 'bank_account',
        bankAccount: { account_holder_name: 'Ana', fields: { iban: 'SE3550000000054910000003' } },
      }),
      params
    );

    expect(res.status).toBe(200);
    expect((await res.json()).warning).toBeUndefined();
    expect(mockDeleteExternal).toHaveBeenCalledTimes(1);
    expect(mockDeleteExternal).toHaveBeenCalledWith('acct_1', 'ba_old');
  });

  it('lets a euro account use a euro bank in another country', async () => {
    mockRetrieve.mockResolvedValue(account({ country: 'EE', default_currency: 'eur' }));
    mockCreateExternal.mockResolvedValue({ id: 'ba_new', object: 'bank_account', last4: '1000', currency: 'eur' });

    const res = await PUT(
      put({
        step: 'bank_account',
        bankAccount: { account_holder_name: 'Ana', fields: { iban: 'LT12 1000 0111 0100 1000' } },
      }),
      params
    );

    expect(res.status).toBe(200);
    expect(mockCreateExternal.mock.calls[0][1].external_account).toMatchObject({
      country: 'LT',
      currency: 'eur',
      account_number: 'LT121000011101001000',
    });
  });

  it("uses the account's default currency", async () => {
    mockRetrieve.mockResolvedValue(account({ country: 'SE', default_currency: 'eur' }));

    await PUT(
      put({
        step: 'bank_account',
        bankAccount: { account_holder_name: 'Ana', fields: { iban: 'DE89370400440532013000' } },
      }),
      params
    );

    expect(mockCreateExternal.mock.calls[0][1].external_account).toMatchObject({ country: 'DE', currency: 'eur' });
  });

  it('explains when a bank in another country is refused', async () => {
    mockRetrieve.mockResolvedValue(account({ country: 'EE', default_currency: 'eur' }));
    mockCreateExternal.mockRejectedValue(
      Object.assign(new Error('external_account[country] is not supported for this account'), {
        type: 'StripeInvalidRequestError',
      })
    );

    const res = await PUT(
      put({
        step: 'bank_account',
        bankAccount: { account_holder_name: 'Ana', fields: { iban: 'BE62510007547061' } },
      }),
      params
    );

    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toContain('Use a bank account in Estonia');
    expect(error).not.toContain('external_account');
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

describe('business_info', () => {
  const address = {
    line1: 'Narva mnt 5',
    city: 'Tallinn',
    state: 'Harjumaa',
    postal_code: '10117',
    country: 'EE',
  };

  it('keeps the company name, address and phone together', async () => {
    mockRetrieve.mockResolvedValue(account({ country: 'EE', business_type: 'company' }));

    const res = await PUT(
      put({
        step: 'business_info',
        businessInfo: {
          type: 'company',
          name: 'Salsa OÜ',
          address,
          phone: '+3725551234',
          url: 'https://dance-hub.io/salsa',
          mcc: '8299',
        },
      }),
      params
    );

    expect(res.status).toBe(200);
    const updateArg = mockUpdate.mock.calls[0][1];
    expect(updateArg.business_type).toBe('company');
    expect(updateArg.company).toEqual({ name: 'Salsa OÜ', address, phone: '+3725551234' });
    expect(updateArg.individual).toBeUndefined();
    expect(updateArg.business_profile).toEqual({ url: 'https://dance-hub.io/salsa', mcc: '8299' });
  });

  it("leaves an individual's name, address and phone to the personal step", async () => {
    // Step 1 is re-saved when the owner goes back to it; splitting "Maria José
    // Garcia" on spaces would overwrite the legal name from step 2.
    mockRetrieve.mockResolvedValue(account({ country: 'EE' }));

    await PUT(
      put({
        step: 'business_info',
        businessInfo: {
          type: 'individual',
          name: 'Maria José Garcia',
          address,
          phone: '+3725551234',
          url: 'https://dance-hub.io/salsa',
          mcc: '8299',
        },
      }),
      params
    );

    const updateArg = mockUpdate.mock.calls[0][1];
    expect(updateArg.individual).toBeUndefined();
    expect(updateArg.business_type).toBe('individual');
    expect(updateArg.business_profile).toEqual({ url: 'https://dance-hub.io/salsa', mcc: '8299' });
  });

  it('records ToS acceptance with the server time and the request user agent', async () => {
    const now = new Date('2026-10-01T12:00:00Z').getTime();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
    try {
      await PUT(
        put(
          {
            step: 'business_info',
            businessInfo: { type: 'individual', name: 'Ana Lopez' },
            tosAcceptance: { accepted: true, date: '2001-01-01T00:00:00Z', userAgent: 'forged agent' },
          },
          { 'user-agent': 'Mozilla/5.0 (real browser)', 'x-real-ip': '203.0.113.9' }
        ),
        params
      );
    } finally {
      spy.mockRestore();
    }

    expect(mockUpdate.mock.calls[0][1].tos_acceptance).toEqual({
      date: Math.floor(now / 1000),
      ip: '203.0.113.9',
      user_agent: 'Mozilla/5.0 (real browser)',
    });
  });

  it('does not record ToS acceptance unless it was accepted', async () => {
    await PUT(
      put({
        step: 'business_info',
        businessInfo: { type: 'individual', name: 'Ana Lopez' },
        tosAcceptance: { accepted: false },
      }),
      params
    );

    expect(mockUpdate.mock.calls[0][1].tos_acceptance).toBeUndefined();
  });
});

describe('personal_info', () => {
  const personalInfo = {
    first_name: 'Ana',
    last_name: 'Lopez',
    email: 'ana@example.com',
    phone: '+3725551234',
    dob: { day: 1, month: 2, year: 1990 },
    address: { line1: 'Narva mnt 5', city: 'Tallinn', state: 'Harju', postal_code: '10117', country: 'EE' },
  };

  it('sets individual fields on an individual account', async () => {
    await PUT(put({ step: 'personal_info', personalInfo }), params);

    expect(mockUpdate).toHaveBeenCalledWith('acct_1', { individual: personalInfo });
    expect(mockCreatePerson).not.toHaveBeenCalled();
  });

  it('creates the representative for a company account', async () => {
    mockRetrieve.mockResolvedValue(account({ business_type: 'company' }));
    mockListPersons.mockResolvedValue({ data: [] });
    mockCreatePerson.mockResolvedValue({ id: 'person_1' });

    const res = await PUT(put({ step: 'personal_info', personalInfo }), params);

    expect(res.status).toBe(200);
    expect(mockListPersons).toHaveBeenCalledWith('acct_1', {
      relationship: { representative: true },
      limit: 1,
    });
    expect(mockCreatePerson).toHaveBeenCalledWith('acct_1', {
      ...personalInfo,
      relationship: { representative: true },
    });
    // `individual` is not valid on a company account.
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('updates the existing representative instead of adding another', async () => {
    mockRetrieve.mockResolvedValue(account({ business_type: 'company' }));
    mockListPersons.mockResolvedValue({ data: [{ id: 'person_1' }] });

    await PUT(put({ step: 'personal_info', personalInfo }), params);

    expect(mockUpdatePerson).toHaveBeenCalledWith('acct_1', 'person_1', {
      ...personalInfo,
      relationship: { representative: true },
    });
    expect(mockCreatePerson).not.toHaveBeenCalled();
  });

  it('returns the error when Stripe rejects the representative', async () => {
    mockRetrieve.mockResolvedValue(account({ business_type: 'company' }));
    mockListPersons.mockResolvedValue({ data: [] });
    mockCreatePerson.mockRejectedValue(new Error('Invalid date of birth'));

    const res = await PUT(put({ step: 'personal_info', personalInfo }), params);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Invalid date of birth');
  });
});

describe('onboarding progress', () => {
  it('does not store date of birth, ID number, address or phone', async () => {
    await PUT(
      put({
        step: 'personal_info',
        currentStep: 2,
        personalInfo: {
          first_name: 'Ana',
          last_name: 'Lopez',
          email: 'ana@example.com',
          phone: '+3725550000',
          dob: { day: 17, month: 3, year: 1987 },
          address: { line1: 'Secret street 1', city: 'Tallinn', state: 'Harju', postal_code: '10117', country: 'EE' },
          ssn_last_4: '9876',
        },
      }),
      params
    );

    const written = JSON.stringify(progressJsonWrites());
    expect(written).toContain('Ana');
    for (const value of ['+3725550000', '1987', 'Secret street', '9876']) {
      expect(written).not.toContain(value);
    }
  });

  it('does not store the business address or phone', async () => {
    await PUT(
      put({
        step: 'business_info',
        businessInfo: {
          type: 'individual',
          name: 'Ana Lopez',
          phone: '+3725550000',
          address: { line1: 'Secret street 1', city: 'Tallinn', state: 'Harju', postal_code: '10117', country: 'EE' },
        },
      }),
      params
    );

    const written = JSON.stringify(progressJsonWrites());
    expect(written).toContain('Ana Lopez');
    expect(written).not.toContain('+3725550000');
    expect(written).not.toContain('Secret street');
  });
});
