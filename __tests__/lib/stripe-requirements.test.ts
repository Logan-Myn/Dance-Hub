/**
 * @jest-environment node
 *
 * Requirement codes from Stripe are specific (individual.dob.day,
 * person_xxx.verification.document, ...). The onboarding screens show a
 * readable message for them instead of the raw code.
 */
process.env.STRIPE_SECRET_KEY ||= 'sk_test_dummy';
const { mapStripeRequirement } = require('@/lib/stripe') as typeof import('@/lib/stripe');

it.each([
  ['individual.dob.day', 'Date of birth required', 'personal'],
  ['individual.address.line1', 'Personal address verification required', 'personal'],
  ['individual.verification.document', 'Government-issued photo ID required', 'personal'],
  ['person_1AbCdEf.verification.document', 'Government-issued photo ID required', 'personal'],
  ['representative.first_name', 'First name required', 'personal'],
  ['company.name', 'Company name required', 'business'],
  ['company.address.city', 'Business address verification required', 'business'],
  ['external_account', 'Bank account information required', 'banking'],
])('%s -> %s', (code, message, category) => {
  expect(mapStripeRequirement(code)).toEqual({ code, message, category });
});

it('turns an unknown code into readable text instead of showing it raw', () => {
  expect(mapStripeRequirement('individual.political_exposure').message).toBe('Political exposure required');
  expect(mapStripeRequirement('business_profile.product_description').message).toBe(
    'Product description required'
  );
});
