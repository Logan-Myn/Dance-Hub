-- Weekly series (community redesign, phase 4): classes created together with
-- "Repeat weekly" share a series id, so the calendar can label them.
--
-- Safe to run more than once.
ALTER TABLE live_classes ADD COLUMN IF NOT EXISTS series_id uuid;
CREATE INDEX IF NOT EXISTS live_classes_series_id_idx ON live_classes (series_id) WHERE series_id IS NOT NULL;

COMMENT ON COLUMN live_classes.series_id IS 'Set on classes created together by "Repeat weekly".';
