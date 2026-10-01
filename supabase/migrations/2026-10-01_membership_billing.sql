-- Stripe webhook event dedupe (review fix H4).
--
-- One row per Stripe event id. The webhook claims the event ('processing')
-- before running its handler, marks it 'processed' after a 2xx, and deletes
-- the claim when the handler fails so Stripe's retry runs it again. A claim
-- left behind by a crashed attempt is taken over after a few minutes.
--
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id     text PRIMARY KEY,
  event_type   text NOT NULL,
  account_id   text,
  status       text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'processed')),
  claimed_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_claimed_at
  ON stripe_webhook_events (claimed_at);

COMMENT ON TABLE stripe_webhook_events IS
  'Stripe webhook events already handled (or being handled), so redeliveries are skipped.';
