-- Drop the Daily.co video-room columns. Video runs on LiveKit via Stream-Hub
-- (livekit_room_name); nothing reads or writes these since the Daily removal.
-- Apply AFTER the code that stops selecting them is deployed.
--
-- live_class_recordings.daily_recording_id is kept on purpose: it is the only
-- reference to the source of a few pre-LiveKit recordings.

BEGIN;

-- The view selects lc.daily_room_*, so it must be rebuilt without them.
DROP VIEW IF EXISTS live_classes_with_details;

ALTER TABLE live_classes
  DROP COLUMN IF EXISTS daily_room_name,
  DROP COLUMN IF EXISTS daily_room_url,
  DROP COLUMN IF EXISTS daily_room_token_teacher,
  DROP COLUMN IF EXISTS daily_room_expires_at;

ALTER TABLE lesson_bookings
  DROP COLUMN IF EXISTS daily_room_name,
  DROP COLUMN IF EXISTS daily_room_url,
  DROP COLUMN IF EXISTS daily_room_created_at,
  DROP COLUMN IF EXISTS daily_room_expires_at,
  DROP COLUMN IF EXISTS teacher_daily_token,
  DROP COLUMN IF EXISTS student_daily_token;

CREATE VIEW live_classes_with_details AS
SELECT lc.id,
    lc.community_id,
    lc.teacher_id,
    lc.title,
    lc.description,
    lc.scheduled_start_time,
    lc.duration_minutes,
    lc.status,
    lc.created_at,
    lc.updated_at,
    lc.reminder_sent_at,
    lc.enable_recording,
    lc.recording_id,
    u.name AS teacher_name,
    u.image AS teacher_avatar_url,
    c.name AS community_name,
    c.slug AS community_slug,
    c.created_by AS community_created_by,
    CASE
        WHEN now() >= lc.scheduled_start_time
         AND now() <= (lc.scheduled_start_time + '00:01:00'::interval * lc.duration_minutes::double precision)
        THEN true ELSE false
    END AS is_currently_active,
    CASE
        WHEN lc.scheduled_start_time <= (now() + '00:15:00'::interval)
         AND lc.scheduled_start_time > now()
        THEN true ELSE false
    END AS is_starting_soon
FROM live_classes lc
JOIN "user" u ON lc.teacher_id = u.id
JOIN communities c ON lc.community_id = c.id;

COMMIT;
