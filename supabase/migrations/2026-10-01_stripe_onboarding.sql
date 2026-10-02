-- Remove raw personal and bank details from stripe_onboarding_progress.
--
-- Stripe holds everything the payout onboarding wizard submits; this table
-- only tracks how far an owner got. Rows written before 2026-10-01 also kept
-- full account / routing numbers or IBANs, dates of birth, SSN last 4, home
-- and business addresses and phone numbers.
--
-- Data cleanup only, no schema change. The code no longer reads or writes
-- these keys, so it can run before or after the deploy. Safe to run twice:
-- each UPDATE only matches rows that are still string-encoded or still hold
-- one of the keys.

BEGIN;

-- Rows written during the July jsonb double-encode bug can hold a JSON
-- string instead of an object, which the key removals below would skip.
-- Decode those first so their details are redacted too.
UPDATE stripe_onboarding_progress SET business_info = (business_info #>> '{}')::jsonb
WHERE jsonb_typeof(business_info) = 'string';
UPDATE stripe_onboarding_progress SET personal_info = (personal_info #>> '{}')::jsonb
WHERE jsonb_typeof(personal_info) = 'string';
UPDATE stripe_onboarding_progress SET bank_account = (bank_account #>> '{}')::jsonb
WHERE jsonb_typeof(bank_account) = 'string';
UPDATE stripe_onboarding_progress SET documents = (documents #>> '{}')::jsonb
WHERE jsonb_typeof(documents) = 'string';

-- Bank account: keep holder name, country, currency; replace numbers by last 4.
UPDATE stripe_onboarding_progress
SET bank_account =
      (bank_account - 'account_number' - 'routing_number' - 'iban' - 'fields')
      || CASE
           WHEN COALESCE(bank_account->>'account_number', bank_account->>'iban') IS NOT NULL
                AND NOT (bank_account ? 'last4')
           THEN jsonb_build_object(
                  'last4',
                  right(regexp_replace(COALESCE(bank_account->>'account_number', bank_account->>'iban'), '\s', '', 'g'), 4)
                )
           ELSE '{}'::jsonb
         END
WHERE bank_account ?| ARRAY['account_number', 'routing_number', 'iban', 'fields'];

-- Personal info: keep name and email only.
UPDATE stripe_onboarding_progress
SET personal_info = personal_info - 'dob' - 'ssn_last_4' - 'id_number' - 'address' - 'phone'
WHERE personal_info ?| ARRAY['dob', 'ssn_last_4', 'id_number', 'address', 'phone'];

-- Business info: drop address and phone, keep the address country.
UPDATE stripe_onboarding_progress
SET business_info =
      (business_info - 'address' - 'phone')
      || CASE
           WHEN business_info->'address'->>'country' IS NOT NULL AND NOT (business_info ? 'country')
           THEN jsonb_build_object('country', business_info->'address'->>'country')
           ELSE '{}'::jsonb
         END
WHERE business_info ?| ARRAY['address', 'phone'];

COMMIT;
