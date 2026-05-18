-- Per-lesson cancellation policy
ALTER TABLE private_lessons
  ADD COLUMN cancellation_cutoff_hours INT NOT NULL DEFAULT 24,
  ADD COLUMN late_refund_policy TEXT NOT NULL DEFAULT 'no_refund'
    CHECK (late_refund_policy IN ('refund', 'no_refund'));

-- Cancellation audit columns on bookings
ALTER TABLE lesson_bookings
  ADD COLUMN canceled_at TIMESTAMPTZ NULL,
  ADD COLUMN canceled_by TEXT NULL CHECK (canceled_by IN ('student', 'teacher'));

-- Allow 'refunded' as a payment_status value
ALTER TABLE lesson_bookings
  DROP CONSTRAINT lesson_bookings_payment_status_check;

ALTER TABLE lesson_bookings
  ADD CONSTRAINT lesson_bookings_payment_status_check
    CHECK (payment_status IN ('pending', 'succeeded', 'failed', 'canceled', 'refunded'));
