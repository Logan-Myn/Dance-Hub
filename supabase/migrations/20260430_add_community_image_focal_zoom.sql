-- Adds creator-controlled banner positioning (Facebook-style "Drag to
-- reposition" + zoom). Defaults preserve current behaviour: 50/50 focal
-- with no zoom == centered object-cover.

ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS image_focal_x INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS image_focal_y INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS image_zoom NUMERIC(4,2) NOT NULL DEFAULT 1.00;
