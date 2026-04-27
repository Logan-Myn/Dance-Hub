-- Track when a community membership was cancelled.
-- The schema previously had no timestamp for "when did this person leave",
-- which the admin dashboard needs to count cancellations per month.
-- Stamped by app/api/webhooks/stripe/route.ts (subscription deleted)
-- and app/api/cron/process-community-openings/route.ts (no subscription found).

ALTER TABLE community_members
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;
