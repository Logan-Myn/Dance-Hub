-- supabase/migrations/2026-05-02_per_community_email_preferences.sql
--
-- Per-community email preferences — one row per (member, community).
-- Layered with the global email_preferences.teacher_broadcast as a master
-- kill switch. Lazy rows: missing row = receive (default-allow).
--
-- Also drops two columns from email_preferences that have no senders or
-- callers anywhere in the codebase.

CREATE TABLE IF NOT EXISTS community_email_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  broadcasts_enabled BOOLEAN DEFAULT true NOT NULL,
  unsubscribed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, community_id)
);

CREATE INDEX IF NOT EXISTS idx_cep_user_id ON community_email_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_cep_community_id ON community_email_preferences(community_id);

COMMENT ON TABLE community_email_preferences IS
  'Per-community email opt-out. Missing row = opted in (default-allow). Layered with email_preferences.teacher_broadcast as master kill.';

-- Drop dead columns (no senders, no UI semantics worth preserving).
ALTER TABLE email_preferences DROP COLUMN IF EXISTS community_updates;
ALTER TABLE email_preferences DROP COLUMN IF EXISTS weekly_digest;
