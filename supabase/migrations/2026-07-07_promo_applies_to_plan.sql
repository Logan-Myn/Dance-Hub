-- Per-plan scope for community promo codes. Monthly and yearly membership share
-- one Stripe product, so this scope is enforced in-app (at validation), not by
-- Stripe. Existing codes default to 'both' so nothing changes for them.
ALTER TABLE community_promo_codes
  ADD COLUMN IF NOT EXISTS applies_to_plan TEXT NOT NULL DEFAULT 'both';
