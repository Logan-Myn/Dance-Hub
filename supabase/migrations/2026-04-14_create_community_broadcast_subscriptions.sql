-- supabase/migrations/2026-04-14_create_community_broadcast_subscriptions.sql

CREATE TABLE community_broadcast_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL UNIQUE REFERENCES communities(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL,
  stripe_subscription_id text NOT NULL,
  status text NOT NULL
    CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete')),
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_community_broadcast_subscriptions_stripe_sub
  ON community_broadcast_subscriptions (stripe_subscription_id);

COMMENT ON TABLE community_broadcast_subscriptions IS
  'Stripe subscription state for the €10/month unlimited broadcast tier, one row per community.';
