-- Feed visits: when a member last opened the community feed (redesign,
-- phase 2). Posts written by others after the previous visit get a "New" dot.
-- POST /api/community/[slug]/feed-visit keeps both columns up to date.
--
-- Safe to run more than once.
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS feed_visit_at timestamptz;
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS feed_prev_visit_at timestamptz;

COMMENT ON COLUMN community_members.feed_visit_at IS 'Last time this member opened the community feed.';
COMMENT ON COLUMN community_members.feed_prev_visit_at IS 'The visit before feed_visit_at, at least 30 minutes earlier. Baseline for "New" posts.';
