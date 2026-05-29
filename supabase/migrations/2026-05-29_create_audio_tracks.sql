-- Alternate (per-language) audio tracks attached to a Mux video asset.
-- Keyed by mux_asset_id so it serves both course lessons (lessons.video_asset_id)
-- and About-page videos uniformly. Playback needs nothing from this table;
-- it backs the authoring UI (list languages, show status, prevent duplicates, delete).
CREATE TABLE IF NOT EXISTS audio_tracks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mux_asset_id  text NOT NULL,
  mux_track_id  text,                              -- null until Mux returns it
  language_code text NOT NULL,                     -- BCP-47, e.g. 'es'
  name          text NOT NULL,                     -- display label, e.g. 'Español'
  status        text NOT NULL DEFAULT 'preparing', -- 'preparing' | 'ready' | 'errored'
  b2_key        text,                              -- uploaded source object, for cleanup/retry
  created_by    text NOT NULL,                     -- user id
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mux_asset_id, language_code)
);

CREATE INDEX IF NOT EXISTS idx_audio_tracks_asset ON audio_tracks (mux_asset_id);
CREATE INDEX IF NOT EXISTS idx_audio_tracks_track ON audio_tracks (mux_track_id);
