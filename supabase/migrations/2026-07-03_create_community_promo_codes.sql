-- Membership promo codes. One row per code created by a community owner.
-- Mirrors two objects on the community's connected Stripe account:
--   stripe_coupon_id          -> the discount shape (percent/amount + duration)
--   stripe_promotion_code_id  -> the customer-facing code string + limits
-- Stripe is the source of truth for redemption counting/expiry/limits; this
-- table is for listing in the owner UI and linking codes to a community.
CREATE TABLE IF NOT EXISTS community_promo_codes (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id             uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  code                     text NOT NULL,                 -- customer-facing string, e.g. MARCELA20
  stripe_coupon_id         text NOT NULL,
  stripe_promotion_code_id text NOT NULL,
  discount_type            text NOT NULL CHECK (discount_type IN ('percent','amount')),
  discount_value           numeric NOT NULL,              -- percent (1-100) or amount in major units
  duration                 text NOT NULL CHECK (duration IN ('once','repeating')),
  duration_in_months       integer,                       -- null unless duration = 'repeating'
  max_redemptions          integer,                       -- null = unlimited
  expires_at               timestamptz,                   -- null = no expiry
  active                   boolean NOT NULL DEFAULT true,
  created_by               text NOT NULL,                 -- user id
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, code)
);

CREATE INDEX IF NOT EXISTS idx_community_promo_codes_community
  ON community_promo_codes (community_id);
