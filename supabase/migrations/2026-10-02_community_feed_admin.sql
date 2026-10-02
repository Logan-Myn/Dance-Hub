-- Review-fix batch 3 (community, feed, admin).
--
-- Safe to run more than once.

-- M6: one course per slug within a community. Every course route resolves a
-- course by (community_id, slug), so a duplicate lets an edit or delete hit
-- the wrong course. Course create now de-duplicates slugs; this index is the
-- guard against two concurrent creates picking the same one.
--
-- If duplicates exist the index is not created: the block raises a NOTICE
-- listing them, and the migration can be run again once they are renamed.
DO $$
DECLARE
  dupes text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'courses'
      AND indexname = 'courses_community_id_slug_key'
  ) THEN
    RETURN;
  END IF;

  SELECT string_agg(format('%s/%s (%s rows)', community_id, slug, n), ', ')
    INTO dupes
  FROM (
    SELECT community_id, slug, COUNT(*) AS n
    FROM courses
    GROUP BY community_id, slug
    HAVING COUNT(*) > 1
  ) d;

  IF dupes IS NOT NULL THEN
    RAISE NOTICE 'courses_community_id_slug_key NOT created: duplicate (community_id, slug) rows: %. Rename them and run this migration again.', dupes;
    RETURN;
  END IF;

  CREATE UNIQUE INDEX courses_community_id_slug_key ON courses (community_id, slug);
END $$;

-- M10: who didn't receive a broadcast ([{ "userId", "email", "error" }]), so a
-- resend can target only them. The broadcast route writes it in a separate,
-- best-effort UPDATE, so sending works before this column exists.
ALTER TABLE email_broadcasts
  ADD COLUMN IF NOT EXISTS failed_recipients jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN email_broadcasts.failed_recipients IS
  'Recipients a send failed for: [{userId, email, error}]. Empty when everyone received it.';

-- M31: member-count fee tiers as the landing page states them: 8% under 50
-- members, 6% from 50 to 100, 4% above 100. These functions returned 8% at
-- exactly 50 members.
--
-- Neither sets what is charged: the app computes the fee from
-- lib/platform-fees.ts and sets it on the Stripe subscription and invoice.
-- calculate_platform_fee_percentage is called by update_community_fee_tier
-- (from the member-count trigger, where installed) to fill the recorded
-- community_members.platform_fee_percentage. Nothing calls the _with_promo
-- variant; it is updated so the two agree.
CREATE OR REPLACE FUNCTION calculate_platform_fee_percentage(member_count INT)
RETURNS DECIMAL AS $$
BEGIN
  IF member_count < 50 THEN
    RETURN 8.0;
  ELSIF member_count <= 100 THEN
    RETURN 6.0;
  ELSE
    RETURN 4.0;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_platform_fee_percentage_with_promo(
  member_count INT,
  is_promotional BOOLEAN DEFAULT FALSE,
  promotional_fee DECIMAL DEFAULT 0.0
)
RETURNS DECIMAL AS $$
BEGIN
  IF is_promotional THEN
    RETURN promotional_fee;
  END IF;

  IF member_count < 50 THEN
    RETURN 8.0;
  ELSIF member_count <= 100 THEN
    RETURN 6.0;
  ELSE
    RETURN 4.0;
  END IF;
END;
$$ LANGUAGE plpgsql;
