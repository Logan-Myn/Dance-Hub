-- Redesign phase 7: who a broadcast went to (all members, paying members,
-- members who are canceling). Existing broadcasts went to everyone.
ALTER TABLE email_broadcasts
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_broadcasts_audience_check') THEN
    ALTER TABLE email_broadcasts
      ADD CONSTRAINT email_broadcasts_audience_check CHECK (audience IN ('all', 'paying', 'canceling'));
  END IF;
END $$;
