-- Private lessons (review fixes, batch 4).
--
-- M3: one booking per availability slot. A canceled booking frees its slot
-- (the cancel route also clears availability_slot_id). The book route refuses
-- a taken slot before any payment; this index is the guarantee when two
-- payments for the same slot race, and the Stripe webhook refunds the payment
-- whose booking insert fails on it.
--
-- Checked on prod and preprod before writing this: no slot has more than one
-- booking that isn't canceled, so the index builds cleanly.
--
-- Safe to run more than once.
CREATE UNIQUE INDEX IF NOT EXISTS lesson_bookings_active_slot_key
  ON lesson_bookings (availability_slot_id)
  WHERE availability_slot_id IS NOT NULL AND lesson_status <> 'canceled';

COMMENT ON INDEX lesson_bookings_active_slot_key IS
  'At most one booking per availability slot that is not canceled.';
