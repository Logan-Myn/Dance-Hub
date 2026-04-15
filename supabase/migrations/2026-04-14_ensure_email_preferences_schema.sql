-- supabase/migrations/2026-04-14_ensure_email_preferences_schema.sql
--
-- Ensure email_preferences + email_events exist (porting from Supabase-era
-- migration that referenced auth.users and was never applied to Neon).
-- Also adds the teacher_broadcast column needed by the Community Broadcasts feature.
--
-- All operations are guarded with IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
-- CREATE OR REPLACE so this migration is safe to apply to environments where
-- the schema already exists (e.g., if the same migration is later run on prod).

-- ============================================================================
-- email_preferences
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  transactional_emails BOOLEAN DEFAULT true NOT NULL,
  marketing_emails BOOLEAN DEFAULT true,
  course_announcements BOOLEAN DEFAULT true,
  lesson_reminders BOOLEAN DEFAULT true,
  community_updates BOOLEAN DEFAULT true,
  weekly_digest BOOLEAN DEFAULT false,
  unsubscribe_token VARCHAR(255) UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  unsubscribed_all BOOLEAN DEFAULT false,
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_email_preferences_user_id ON email_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_email_preferences_email ON email_preferences(email);
CREATE INDEX IF NOT EXISTS idx_email_preferences_unsubscribe_token ON email_preferences(unsubscribe_token);

-- The broadcasts feature's opt-out column. Safe to re-run.
ALTER TABLE email_preferences ADD COLUMN IF NOT EXISTS teacher_broadcast BOOLEAN DEFAULT true NOT NULL;

COMMENT ON TABLE email_preferences IS
  'User email notification preferences and unsubscribe tokens.';
COMMENT ON COLUMN email_preferences.teacher_broadcast IS
  'Whether this user accepts teacher/community-owner newsletter broadcasts. Default true — members opt in by joining a community.';

-- ============================================================================
-- email_events
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  email VARCHAR(255) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  email_type VARCHAR(50) NOT NULL,
  subject VARCHAR(500),
  resend_email_id VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_events_user_id ON email_events(user_id);
CREATE INDEX IF NOT EXISTS idx_email_events_email ON email_events(email);
CREATE INDEX IF NOT EXISTS idx_email_events_event_type ON email_events(event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_email_type ON email_events(email_type);
CREATE INDEX IF NOT EXISTS idx_email_events_created_at ON email_events(created_at);

COMMENT ON TABLE email_events IS
  'Audit trail of outbound emails (sent/delivered/opened/clicked/bounced/failed).';

-- ============================================================================
-- updated_at trigger for email_preferences
-- ============================================================================

CREATE OR REPLACE FUNCTION update_email_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_email_preferences_updated_at ON email_preferences;
CREATE TRIGGER update_email_preferences_updated_at
  BEFORE UPDATE ON email_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_email_preferences_updated_at();

-- ============================================================================
-- Auto-create email_preferences row when a profile is inserted
-- ============================================================================

CREATE OR REPLACE FUNCTION create_email_preferences_for_profile()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    INSERT INTO email_preferences (user_id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS create_email_preferences_on_profile_insert ON profiles;
CREATE TRIGGER create_email_preferences_on_profile_insert
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_email_preferences_for_profile();

-- ============================================================================
-- Backfill for existing profiles that don't yet have preferences
-- ============================================================================

INSERT INTO email_preferences (user_id, email)
SELECT id, email FROM profiles WHERE email IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;
