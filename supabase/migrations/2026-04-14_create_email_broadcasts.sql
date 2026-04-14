-- supabase/migrations/2026-04-14_create_email_broadcasts.sql

CREATE TABLE email_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES profiles(id),
  subject text NOT NULL,
  html_content text NOT NULL,
  editor_json jsonb NOT NULL,
  preview_text text,
  recipient_count integer NOT NULL DEFAULT 0,
  status text NOT NULL
    CHECK (status IN ('pending', 'sending', 'sent', 'partial_failure', 'failed')),
  resend_batch_ids text[] NOT NULL DEFAULT '{}',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_broadcasts_community_created
  ON email_broadcasts (community_id, created_at DESC);

COMMENT ON TABLE email_broadcasts IS
  'Audit trail of community broadcast emails. Also the source of truth for monthly quota counting.';
