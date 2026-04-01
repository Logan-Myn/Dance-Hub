-- Stream-Hub integration: add LiveKit room tracking
-- Run on preprod Neon branch only. Daily columns kept for production compatibility.
ALTER TABLE live_classes ADD COLUMN IF NOT EXISTS livekit_room_name TEXT;
ALTER TABLE lesson_bookings ADD COLUMN IF NOT EXISTS livekit_room_name TEXT;
