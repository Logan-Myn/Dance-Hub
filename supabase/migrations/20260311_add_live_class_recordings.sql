-- Add recording support for live classes
-- Enables teachers to record live classes, process via Mux, and auto-create replay lessons

-- Add recording toggle to live_classes
ALTER TABLE live_classes ADD COLUMN enable_recording BOOLEAN DEFAULT false;
ALTER TABLE live_classes ADD COLUMN recording_id UUID;

-- Recording segments table
CREATE TABLE live_class_recordings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  live_class_id UUID REFERENCES live_classes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'recording', 'processing', 'ready', 'failed')),
  daily_recording_id TEXT,
  mux_asset_id TEXT,
  mux_playback_id TEXT,
  duration_seconds DOUBLE PRECISION,
  lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add foreign key constraint for recording_id
ALTER TABLE live_classes ADD CONSTRAINT fk_live_class_recording
  FOREIGN KEY (recording_id) REFERENCES live_class_recordings(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX idx_live_class_recordings_live_class_id ON live_class_recordings(live_class_id);
CREATE INDEX idx_live_class_recordings_status ON live_class_recordings(status);
CREATE INDEX idx_live_class_recordings_mux_asset_id ON live_class_recordings(mux_asset_id);

-- Updated at trigger
CREATE TRIGGER update_live_class_recordings_updated_at
  BEFORE UPDATE ON live_class_recordings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update the live_classes_with_details view to include recording fields
DROP VIEW IF EXISTS live_classes_with_details;

CREATE VIEW live_classes_with_details AS
SELECT
  lc.*,
  p.display_name as teacher_name,
  p.avatar_url as teacher_avatar_url,
  c.name as community_name,
  c.slug as community_slug,
  c.created_by as community_created_by,
  CASE
    WHEN NOW() >= lc.scheduled_start_time AND NOW() <= (lc.scheduled_start_time + INTERVAL '1 minute' * lc.duration_minutes)
    THEN true
    ELSE false
  END as is_currently_active,
  CASE
    WHEN lc.scheduled_start_time <= (NOW() + INTERVAL '15 minutes') AND lc.scheduled_start_time > NOW()
    THEN true
    ELSE false
  END as is_starting_soon
FROM live_classes lc
JOIN profiles p ON lc.teacher_id::uuid = p.id
JOIN communities c ON lc.community_id = c.id;
