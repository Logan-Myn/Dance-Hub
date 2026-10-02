/**
 * The onboarding status route must not send stored bank numbers, dates of
 * birth, ID numbers, addresses or phone numbers back to the browser.
 */
import { GET } from '@/app/api/stripe/custom-account/[accountId]/status/route';

const mockRetrieve = jest.fn();
jest.mock('@/lib/stripe', () => {
  process.env.STRIPE_SECRET_KEY ||= 'sk_test_dummy';
  const actual = jest.requireActual('@/lib/stripe');
  return { ...actual, stripe: { accounts: { retrieve: (...a: unknown[]) => mockRetrieve(...a) } } };
});

const mockQueryOne = jest.fn();
jest.mock('@/lib/db', () => ({ queryOne: (...a: unknown[]) => mockQueryOne(...a) }));

jest.mock('@/lib/community-auth', () => ({
  requireStripeAccountManager: jest.fn().mockResolvedValue({ ok: true }),
}));

const params = { params: Promise.resolve({ accountId: 'acct_1' }) };
const get = () => new Request('http://x/api/stripe/custom-account/acct_1/status');

beforeEach(() => {
  jest.clearAllMocks();
  mockRetrieve.mockResolvedValue({
    id: 'acct_1',
    country: 'EE',
    business_type: 'individual',
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: true,
    requirements: { currently_due: [], past_due: [], eventually_due: [], pending_verification: [] },
    external_accounts: {
      data: [{ id: 'ba_1', object: 'bank_account', last4: '5685', bank_name: 'LHV', currency: 'eur', default_for_currency: true }],
    },
  });
  // A row written before the fix still holds raw details.
  mockQueryOne.mockResolvedValue({
    current_step: 3,
    completed_steps: [1, 2],
    business_info: { name: 'Ana Lopez', phone: '+3725550000', address: { line1: 'Secret street 1' } },
    personal_info: { dob: { day: 17, month: 3, year: 1987 }, ssn_last_4: '9876', phone: '+3725550000' },
    bank_account: { account_number: 'EE382200221020145685', routing_number: '110000000', iban: 'EE382200221020145685' },
    documents: [{ id: 'file_1', filename: 'passport.png' }],
    updated_at: '2026-09-01T00:00:00Z',
  });
});

it('returns progress and masked bank info but none of the stored personal details', async () => {
  const res = await GET(get(), params);

  expect(res.status).toBe(200);
  const body = await res.json();
  const text = JSON.stringify(body);
  for (const value of ['EE382200221020145685', '110000000', '9876', '1987', '+3725550000', 'Secret street']) {
    expect(text).not.toContain(value);
  }
  expect(body.progress).toMatchObject({ currentStep: 3, completedSteps: [1, 2] });
  expect(body.bankAccounts).toEqual([
    { id: 'ba_1', last4: '5685', bank_name: 'LHV', currency: 'eur', default_for_currency: true },
  ]);
});

it('reports what Stripe is still reviewing and why the account is disabled', async () => {
  mockRetrieve.mockResolvedValue({
    id: 'acct_1',
    country: 'EE',
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: true,
    requirements: {
      currently_due: [],
      past_due: [],
      eventually_due: [],
      pending_verification: ['individual.verification.document'],
      disabled_reason: 'requirements.pending_verification',
      errors: [
        { code: 'verification_document_not_readable', reason: 'The document could not be read.', requirement: 'individual.verification.document' },
      ],
    },
  });

  const body = await (await GET(get(), params)).json();

  expect(body.requirements.pendingVerification).toEqual([
    { code: 'individual.verification.document', message: 'Government-issued photo ID required', category: 'personal' },
  ]);
  expect(body.requirements.disabledReason).toBe('requirements.pending_verification');
  expect(body.requirements.errors).toEqual([
    { code: 'individual.verification.document', reason: 'The document could not be read.' },
  ]);
  expect(body.isFullyVerified).toBe(false);
});
