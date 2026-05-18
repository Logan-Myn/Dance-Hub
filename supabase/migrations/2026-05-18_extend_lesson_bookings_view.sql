-- Extend lesson_bookings_with_details to expose cancellation policy
-- so the teacher booking endpoint returns the same shape as the student endpoint.
-- New columns must be appended at the end so CREATE OR REPLACE VIEW does not
-- reorder existing columns (Postgres only allows adding columns to the tail).
CREATE OR REPLACE VIEW lesson_bookings_with_details AS
SELECT
  lb.id,
  lb.private_lesson_id,
  lb.community_id,
  lb.student_id,
  lb.student_email,
  lb.student_name,
  lb.is_community_member,
  lb.price_paid,
  lb.stripe_payment_intent_id,
  lb.payment_status,
  lb.lesson_status,
  lb.scheduled_at,
  lb.student_message,
  lb.teacher_notes,
  lb.contact_info,
  lb.created_at,
  lb.updated_at,
  pl.title AS lesson_title,
  pl.description AS lesson_description,
  pl.duration_minutes,
  pl.regular_price,
  pl.member_price,
  c.name AS community_name,
  c.slug AS community_slug,
  p.full_name AS student_full_name,
  p.display_name AS student_display_name,
  pl.cancellation_cutoff_hours,
  pl.late_refund_policy
FROM lesson_bookings lb
JOIN private_lessons pl ON lb.private_lesson_id = pl.id
JOIN communities c ON lb.community_id = c.id
LEFT JOIN profiles p ON lb.student_id = p.auth_user_id;
