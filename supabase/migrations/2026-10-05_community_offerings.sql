-- Offerings: which parts of a community are switched on (community redesign,
-- phase 1). All default to true, so every existing community keeps the tabs
-- it has today. The admin screen that changes them ships in phase 7.
--
-- Safe to run more than once.
ALTER TABLE communities ADD COLUMN IF NOT EXISTS offers_live_classes boolean NOT NULL DEFAULT true;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS offers_courses boolean NOT NULL DEFAULT true;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS offers_private_lessons boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN communities.offers_live_classes IS 'Live classes and the Calendar tab are on for members.';
COMMENT ON COLUMN communities.offers_courses IS 'Courses and the Classroom tab are on for members.';
COMMENT ON COLUMN communities.offers_private_lessons IS 'Private lessons and their tab are on.';
