/**
 * @jest-environment node
 *
 * Bank fields and payout currency come from the connected account's country.
 * Euro IBAN countries pay out in EUR, non-euro IBAN countries in their own
 * currency, GB/US/CA/AU/NZ/MX/SG/HK use their local numbers, and anything
 * else is reported as unsupported instead of getting a broken IBAN field.
 */
import {
  buildPayoutBankAccount,
  countryName,
  getBankFields,
  getPayoutBankFormat,
  isValidIban,
  isValidUsRoutingNumber,
} from '@/lib/payout-bank-formats';

describe('getPayoutBankFormat', () => {
  it.each(['EE', 'DE', 'FR', 'ES', 'IT', 'NL', 'FI', 'IE', 'BG', 'HR', 'ee'])(
    '%s uses an IBAN in EUR',
    (country) => {
      expect(getPayoutBankFormat(country)).toEqual({
        kind: 'iban',
        country: country.toUpperCase(),
        currency: 'eur',
      });
    }
  );

  it.each([
    ['CH', 'chf'],
    ['NO', 'nok'],
    ['SE', 'sek'],
    ['DK', 'dkk'],
    ['PL', 'pln'],
    ['CZ', 'czk'],
    ['HU', 'huf'],
    ['RO', 'ron'],
    ['AE', 'aed'],
  ])('%s uses an IBAN in its own currency (%s)', (country, currency) => {
    expect(getPayoutBankFormat(country)).toEqual({ kind: 'iban', country, currency });
  });

  it.each([
    ['US', 'usd'],
    ['GB', 'gbp'],
    ['CA', 'cad'],
    ['AU', 'aud'],
    ['NZ', 'nzd'],
    ['MX', 'mxn'],
    ['SG', 'sgd'],
    ['HK', 'hkd'],
  ])('%s uses local bank numbers in %s', (country, currency) => {
    expect(getPayoutBankFormat(country)).toMatchObject({ kind: 'local', country, currency });
  });

  it.each(['JP', 'BR', 'MY', 'TH', 'XX', '', null, undefined])('%s is unsupported', (country) => {
    expect(getPayoutBankFormat(country as string).kind).toBe('unsupported');
  });

  it('lets GB owners give an IBAN instead of sort code and account number', () => {
    const gb = getPayoutBankFormat('GB');
    expect(getBankFields(gb).map((f) => f.key)).toEqual(['sortCode', 'accountNumber']);
    expect(getBankFields(gb, true).map((f) => f.key)).toEqual(['iban']);
    // Only formats that allow it switch to IBAN.
    expect(getBankFields(getPayoutBankFormat('US'), true).map((f) => f.key)).toEqual([
      'routingNumber',
      'accountNumber',
    ]);
  });
});

describe('isValidIban', () => {
  it.each([
    'EE382200221020145685',
    'EE38 2200 2210 2014 5685',
    'DE89370400440532013000',
    'CH9300762011623852957',
    'NO9386011117947',
    'SE3550000000054910000003',
    'GB82WEST12345698765432',
    'MT84MALT011000012345MTLCAST001S',
    'AE070331234567890123456',
  ])('accepts %s', (iban) => {
    expect(isValidIban(iban)).toBe(true);
  });

  it.each(['EE382200221020145686', 'EE38', 'not an iban', '', '1234567890123456'])(
    'rejects %s',
    (iban) => {
      expect(isValidIban(iban)).toBe(false);
    }
  );
});

it('checks the US routing number checksum', () => {
  expect(isValidUsRoutingNumber('110000000')).toBe(true);
  expect(isValidUsRoutingNumber('110000001')).toBe(false);
});

describe('buildPayoutBankAccount', () => {
  it('sends an IBAN as the account number with the country currency', () => {
    expect(buildPayoutBankAccount('SE', { iban: 'se35 5000 0000 0549 1000 0003' })).toEqual({
      ok: true,
      accountNumber: 'SE3550000000054910000003',
      currency: 'sek',
      country: 'SE',
    });
  });

  it('rejects an IBAN with a bad checksum', () => {
    const result = buildPayoutBankAccount('EE', { iban: 'EE382200221020145686' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.iban).toBeTruthy();
  });

  it('builds US routing and account numbers', () => {
    expect(
      buildPayoutBankAccount('US', { routingNumber: '110000000', accountNumber: '000123456789' })
    ).toEqual({
      ok: true,
      routingNumber: '110000000',
      accountNumber: '000123456789',
      currency: 'usd',
      country: 'US',
    });
  });

  it('reports each invalid US field', () => {
    const result = buildPayoutBankAccount('US', { routingNumber: '110000001', accountNumber: '12' });
    expect(result).toEqual({
      ok: false,
      errors: {
        routingNumber: 'Invalid routing number',
        accountNumber: 'Account number must be 4 to 17 digits',
      },
    });
  });

  it('builds a GB sort code and account number, ignoring dashes', () => {
    expect(buildPayoutBankAccount('GB', { sortCode: '10-88-00', accountNumber: '00012345' })).toEqual({
      ok: true,
      routingNumber: '108800',
      accountNumber: '00012345',
      currency: 'gbp',
      country: 'GB',
    });
  });

  it('accepts a GB IBAN in place of sort code and account number', () => {
    expect(buildPayoutBankAccount('GB', { iban: 'GB82 WEST 1234 5698 7654 32' }, true)).toEqual({
      ok: true,
      accountNumber: 'GB82WEST12345698765432',
      currency: 'gbp',
      country: 'GB',
    });
  });

  it.each([
    // Transit-institution, as in Stripe's Canadian test numbers (11000-000).
    ['CA', { transitNumber: '11000', institutionNumber: '000', accountNumber: '000123456789' }, '11000-000', '000123456789'],
    ['AU', { bsb: '110000', accountNumber: '000123456' }, '110000', '000123456'],
    ['SG', { bankCode: '1100', branchCode: '000', accountNumber: '000123456' }, '1100-000', '000123456'],
    ['HK', { clearingCode: '110', branchCode: '000', accountNumber: '000123-456' }, '110-000', '000123-456'],
  ])('assembles the %s routing number from its parts', (country, values, routing, account) => {
    expect(buildPayoutBankAccount(country, values)).toMatchObject({
      ok: true,
      routingNumber: routing,
      accountNumber: account,
    });
  });

  it.each([
    ['NZ', { accountNumber: '11-0000-0000000-010' }, '1100000000000010'],
    ['MX', { clabe: '000000001234567897' }, '000000001234567897'],
  ])('sends the %s account number without a routing number', (country, values, account) => {
    const result = buildPayoutBankAccount(country, values);
    expect(result).toMatchObject({ ok: true, accountNumber: account });
    expect(result.ok && result.routingNumber).toBeFalsy();
  });

  it('refuses countries the form does not support', () => {
    const result = buildPayoutBankAccount('JP', { accountNumber: '1234567' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.form).toContain('hello@dance-hub.io');
  });
});

describe('IBAN bank country and currency', () => {
  it.each([
    ['LT121000011101001000', 'LT'],
    ['BE62510007547061', 'BE'],
    ['EE382200221020145685', 'EE'],
  ])('a euro account can use a euro IBAN from another country (%s)', (iban, bankCountry) => {
    expect(buildPayoutBankAccount('EE', { iban }, false, { currency: 'eur' })).toEqual({
      ok: true,
      accountNumber: iban,
      currency: 'eur',
      country: bankCountry,
    });
  });

  it("asks for a domestic bank when the payout currency is the country's own", () => {
    const result = buildPayoutBankAccount('SE', { iban: 'DE89370400440532013000' }, false, { currency: 'sek' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.iban).toContain('Use a bank account in Sweden');
  });

  it('uses the account default currency over the country table', () => {
    expect(buildPayoutBankAccount('SE', { iban: 'DE89370400440532013000' }, false, { currency: 'EUR' })).toEqual({
      ok: true,
      accountNumber: 'DE89370400440532013000',
      currency: 'eur',
      country: 'DE',
    });
    expect(buildPayoutBankAccount('US', { routingNumber: '110000000', accountNumber: '000123456789' }, false, {
      currency: null,
    })).toMatchObject({ ok: true, currency: 'usd', country: 'US' });
  });

  it('keeps a GBP IBAN in the UK', () => {
    const result = buildPayoutBankAccount('GB', { iban: 'LT121000011101001000' }, true, { currency: 'gbp' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.iban).toContain('United Kingdom');
  });

  it('names countries for messages', () => {
    expect(countryName('EE')).toBe('Estonia');
    expect(countryName('XX')).toBe('XX');
  });
});
