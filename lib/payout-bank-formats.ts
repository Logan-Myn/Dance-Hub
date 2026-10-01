// Which bank details a payout account needs, by the country of the connected
// account (not the owner's home address). Shared by the onboarding form and
// the API routes so both validate and build the numbers the same way.
//
// Formats follow Stripe's "bank account formats" for connected accounts:
// IBAN countries send the IBAN as account_number with no routing number;
// elsewhere the routing number is assembled from the local bank/branch codes.
// Countries not listed here aren't supported by the in-app form.

export type BankFieldKey =
  | 'iban'
  | 'routingNumber'
  | 'accountNumber'
  | 'sortCode'
  | 'transitNumber'
  | 'institutionNumber'
  | 'bsb'
  | 'clabe'
  | 'bankCode'
  | 'branchCode'
  | 'clearingCode';

export interface BankField {
  key: BankFieldKey;
  label: string;
  placeholder: string;
  hint?: string;
  numeric: boolean;
}

interface FieldRule extends BankField {
  normalize: (raw: string) => string;
  /** Returns an error message, or null when the normalized value is valid. */
  validate: (value: string) => string | null;
}

interface LocalFormatDef {
  currency: string;
  fields: FieldRule[];
  build: (v: Record<string, string>) => { accountNumber: string; routingNumber?: string };
  /** Stripe also accepts an IBAN in place of the local numbers. */
  ibanAlternative?: boolean;
}

export type PayoutBankFormat =
  | { kind: 'iban'; country: string; currency: string }
  | { kind: 'local'; country: string; currency: string; ibanAlternative: boolean }
  | { kind: 'unsupported'; country: string };

export type PayoutBankBuildResult =
  | { ok: true; accountNumber: string; routingNumber?: string; currency: string; country: string }
  | { ok: false; errors: Partial<Record<BankFieldKey | 'form', string>> };

export const PAYOUT_SUPPORT_EMAIL = 'hello@dance-hub.io';

const EURO_IBAN_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV',
  'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES',
];

// IBAN countries that pay out in their own currency.
const LOCAL_CURRENCY_IBAN_COUNTRIES: Record<string, string> = {
  CH: 'chf',
  NO: 'nok',
  SE: 'sek',
  DK: 'dkk',
  PL: 'pln',
  CZ: 'czk',
  HU: 'huf',
  RO: 'ron',
  AE: 'aed',
};

const digitsOnly = (raw: string) => raw.replace(/\D/g, '');

function digitsField(
  key: BankFieldKey,
  label: string,
  placeholder: string,
  min: number,
  max: number,
  hint?: string
): FieldRule {
  const length = min === max ? `${min}` : `${min} to ${max}`;
  return {
    key,
    label,
    placeholder,
    hint,
    numeric: true,
    normalize: digitsOnly,
    validate: (v) => {
      if (!v) return `${label} is required`;
      if (v.length < min || v.length > max) return `${label} must be ${length} digits`;
      return null;
    },
  };
}

// ABA routing number checksum (weights 3, 7, 1).
export function isValidUsRoutingNumber(value: string): boolean {
  if (!/^\d{9}$/.test(value)) return false;
  const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  const sum = value.split('').reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
  return sum % 10 === 0;
}

const US_ROUTING: FieldRule = {
  ...digitsField('routingNumber', 'Routing number', '110000000', 9, 9, '9-digit number on your checks or bank statements'),
  validate: (v) => {
    if (!v) return 'Routing number is required';
    if (v.length !== 9) return 'Routing number must be exactly 9 digits';
    if (!isValidUsRoutingNumber(v)) return 'Invalid routing number';
    return null;
  },
};

const LOCAL_FORMATS: Record<string, LocalFormatDef> = {
  US: {
    currency: 'usd',
    fields: [US_ROUTING, digitsField('accountNumber', 'Account number', '000123456789', 4, 17)],
    build: (v) => ({ routingNumber: v.routingNumber, accountNumber: v.accountNumber }),
  },
  GB: {
    currency: 'gbp',
    fields: [
      digitsField('sortCode', 'Sort code', '10-88-00', 6, 6),
      digitsField('accountNumber', 'Account number', '00012345', 8, 8),
    ],
    build: (v) => ({ routingNumber: v.sortCode, accountNumber: v.accountNumber }),
    ibanAlternative: true,
  },
  CA: {
    currency: 'cad',
    fields: [
      digitsField('transitNumber', 'Transit number', '11000', 5, 5),
      digitsField('institutionNumber', 'Institution number', '000', 3, 3),
      digitsField('accountNumber', 'Account number', '000123456789', 4, 17),
    ],
    build: (v) => ({ routingNumber: `${v.transitNumber}${v.institutionNumber}`, accountNumber: v.accountNumber }),
  },
  AU: {
    currency: 'aud',
    fields: [
      digitsField('bsb', 'BSB', '110000', 6, 6),
      digitsField('accountNumber', 'Account number', '000123456', 4, 9),
    ],
    build: (v) => ({ routingNumber: v.bsb, accountNumber: v.accountNumber }),
  },
  NZ: {
    currency: 'nzd',
    fields: [
      digitsField(
        'accountNumber',
        'Account number',
        '11-0000-0000000-010',
        15,
        16,
        'The full number including bank, branch and suffix'
      ),
    ],
    build: (v) => ({ accountNumber: v.accountNumber }),
  },
  MX: {
    currency: 'mxn',
    fields: [digitsField('clabe', 'CLABE', '000000001234567897', 18, 18)],
    build: (v) => ({ accountNumber: v.clabe }),
  },
  SG: {
    currency: 'sgd',
    fields: [
      digitsField('bankCode', 'Bank code', '1100', 4, 4),
      digitsField('branchCode', 'Branch code', '000', 3, 3),
      digitsField('accountNumber', 'Account number', '000123456', 6, 19),
    ],
    build: (v) => ({ routingNumber: `${v.bankCode}-${v.branchCode}`, accountNumber: v.accountNumber }),
  },
  HK: {
    currency: 'hkd',
    fields: [
      digitsField('clearingCode', 'Clearing code', '110', 3, 3),
      digitsField('branchCode', 'Branch code', '000', 3, 3),
      {
        key: 'accountNumber',
        label: 'Account number',
        placeholder: '000123-456',
        numeric: true,
        normalize: (raw) => raw.replace(/[^\d-]/g, ''),
        validate: (v) => {
          if (!v) return 'Account number is required';
          const digits = digitsOnly(v).length;
          if (digits < 6 || digits > 9) return 'Account number must be 6 to 9 digits';
          return null;
        },
      },
    ],
    build: (v) => ({ routingNumber: `${v.clearingCode}-${v.branchCode}`, accountNumber: v.accountNumber }),
  },
};

export function normalizeIban(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** Format and ISO 13616 mod-97 check. */
export function isValidIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

function ibanField(country: string): FieldRule {
  return {
    key: 'iban',
    label: 'IBAN',
    placeholder: country === 'EE' ? 'EE38 2200 2210 2014 5685' : `${country}00 0000 0000 0000 0000`,
    hint: 'Your International Bank Account Number, shown in your online bank',
    numeric: false,
    normalize: normalizeIban,
    validate: (v) => {
      if (!v) return 'IBAN is required';
      if (!isValidIban(v)) return 'This IBAN is not valid. Check it for typos';
      return null;
    },
  };
}

const upper = (country: string | null | undefined) => (country ?? '').trim().toUpperCase();

export function getPayoutBankFormat(country: string | null | undefined): PayoutBankFormat {
  const c = upper(country);
  if (EURO_IBAN_COUNTRIES.includes(c)) return { kind: 'iban', country: c, currency: 'eur' };
  if (LOCAL_CURRENCY_IBAN_COUNTRIES[c]) {
    return { kind: 'iban', country: c, currency: LOCAL_CURRENCY_IBAN_COUNTRIES[c] };
  }
  const local = LOCAL_FORMATS[c];
  if (local) {
    return { kind: 'local', country: c, currency: local.currency, ibanAlternative: Boolean(local.ibanAlternative) };
  }
  return { kind: 'unsupported', country: c };
}

function fieldRules(format: PayoutBankFormat, useIban: boolean): FieldRule[] {
  if (format.kind === 'iban') return [ibanField(format.country)];
  if (format.kind === 'local') {
    if (useIban && format.ibanAlternative) return [ibanField(format.country)];
    return LOCAL_FORMATS[format.country].fields;
  }
  return [];
}

/** The inputs the form should show for this format. */
export function getBankFields(format: PayoutBankFormat, useIban = false): BankField[] {
  return fieldRules(format, useIban).map(({ key, label, placeholder, hint, numeric }) => ({
    key,
    label,
    placeholder,
    hint,
    numeric,
  }));
}

export function unsupportedCountryMessage(countryName?: string): string {
  const where = countryName ? `in ${countryName}` : 'in your country';
  return `Payouts to banks ${where} can't be set up here yet. Email ${PAYOUT_SUPPORT_EMAIL} and we'll help you finish.`;
}

/**
 * Validates the entered values for the account's country and returns the
 * account_number / routing_number / currency to send to Stripe.
 */
export function buildPayoutBankAccount(
  country: string | null | undefined,
  values: Partial<Record<string, string | null | undefined>>,
  useIban = false
): PayoutBankBuildResult {
  const format = getPayoutBankFormat(country);
  if (format.kind === 'unsupported') {
    return { ok: false, errors: { form: unsupportedCountryMessage() } };
  }

  const rules = fieldRules(format, useIban);
  const normalized: Record<string, string> = {};
  const errors: Partial<Record<BankFieldKey, string>> = {};
  for (const rule of rules) {
    const value = rule.normalize(String(values[rule.key] ?? ''));
    const error = rule.validate(value);
    if (error) errors[rule.key] = error;
    normalized[rule.key] = value;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  if (rules.length === 1 && rules[0].key === 'iban') {
    return { ok: true, accountNumber: normalized.iban, currency: format.currency, country: format.country };
  }
  const built = LOCAL_FORMATS[format.country].build(normalized);
  return { ok: true, ...built, currency: format.currency, country: format.country };
}

// Kept for display: the space-grouped form people see on bank statements.
export function formatIbanForDisplay(raw: string): string {
  return normalizeIban(raw).replace(/(.{4})/g, '$1 ').trim();
}
