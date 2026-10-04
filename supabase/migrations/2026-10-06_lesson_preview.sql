-- Free preview lessons (community redesign, phase 3): a lesson anyone can
-- watch, so visitors can try a course before joining.
--
-- Safe to run more than once.
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS is_preview boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN lessons.is_preview IS 'Free preview: visible to anyone when the course is published.';
