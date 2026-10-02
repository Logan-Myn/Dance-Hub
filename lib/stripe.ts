import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is missing');
}

export const STRIPE_API_VERSION = '2025-12-15.clover' as Stripe.LatestApiVersion;

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: STRIPE_API_VERSION,
});

export const STRIPE_REQUIREMENT_MESSAGES: Record<string, string> = {
  'individual.verification.document': 'Government-issued photo ID required',
  'individual.verification.additional_document': 'Additional identity document required',
  'company.verification.document': 'Business verification document required',
  'company.license': 'Business license required',
  'company.tax_id': 'Business tax ID required',
  'company.tax_id_registrar': 'Tax ID registrar required',
  'company.address': 'Business address verification required',
  'individual.address': 'Personal address verification required',
  'individual.dob': 'Date of birth required',
  'individual.email': 'Email verification required',
  'individual.first_name': 'First name required',
  'individual.last_name': 'Last name required',
  'individual.phone': 'Phone number required',
  'individual.ssn_last_4': 'Last 4 digits of SSN required',
  'individual.id_number': 'ID number required',
  'company.name': 'Company name required',
  'company.phone': 'Company phone number required',
  'company.directors_provided': 'Company directors information required',
  'company.executives_provided': 'Company executives information required',
  'company.owners_provided': 'Company owners information required',
  'external_account': 'Bank account information required',
  'business_profile.url': 'Business website required',
  'business_profile.mcc': 'Business category required',
  'business_type': 'Business type required',
  'tos_acceptance': 'Terms of service acceptance required',
};

// Requirements about a person (the individual, a company's representative,
// or another person on the account) share the individual messages.
function requirementLookupCode(code: string): string {
  return code.replace(/^(person_[A-Za-z0-9]+|representative)\./, 'individual.');
}

// Stripe codes are often more specific than the table (individual.dob.day,
// company.address.city), so use the longest listed prefix. Anything unknown
// becomes readable text rather than a raw code.
function requirementMessage(code: string): string {
  const parts = requirementLookupCode(code).split('.');
  for (let n = parts.length; n > 0; n--) {
    const message = STRIPE_REQUIREMENT_MESSAGES[parts.slice(0, n).join('.')];
    if (message) return message;
  }
  const last = parts[parts.length - 1].replace(/_/g, ' ');
  return `${last.charAt(0).toUpperCase()}${last.slice(1)} required`;
}

export type StripeRequirementCategory = 'personal' | 'business' | 'banking' | 'other';

export function categorizeStripeRequirement(code: string): StripeRequirementCategory {
  code = requirementLookupCode(code);
  if (code.startsWith('individual.')) return 'personal';
  if (/^(company\.|business_profile|business_type|tos_acceptance)/.test(code)) return 'business';
  if (code.includes('external_account')) return 'banking';
  return 'other';
}

export interface StripeRequirementDetail {
  code: string;
  message: string;
  category: StripeRequirementCategory;
}

export function mapStripeRequirement(code: string): StripeRequirementDetail {
  return {
    code,
    message: requirementMessage(code),
    category: categorizeStripeRequirement(code),
  };
}

export function isStripeAccountFullyVerified(account: Stripe.Account): boolean {
  return Boolean(
    account.charges_enabled &&
      account.payouts_enabled &&
      account.details_submitted &&
      !(account.requirements?.currently_due ?? []).length &&
      !(account.requirements?.past_due ?? []).length
  );
}
