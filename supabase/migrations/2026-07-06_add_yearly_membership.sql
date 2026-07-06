-- Optional yearly membership, offered alongside the existing monthly one.
-- Reuses the community's existing stripe_product_id; only a second Price is added.
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS yearly_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS yearly_price           DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS stripe_yearly_price_id TEXT,
  ADD COLUMN IF NOT EXISTS yearly_benefits        TEXT;

CREATE INDEX IF NOT EXISTS idx_communities_stripe_yearly_price_id
  ON communities(stripe_yearly_price_id);
