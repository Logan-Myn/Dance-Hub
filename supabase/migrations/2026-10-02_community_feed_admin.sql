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
