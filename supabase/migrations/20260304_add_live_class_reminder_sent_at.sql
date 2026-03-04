-- Add reminder_sent_at column to track when reminder emails were sent for live classes
ALTER TABLE live_classes ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
