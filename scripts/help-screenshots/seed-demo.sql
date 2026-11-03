-- Demo content for the help center screenshots, on PREPROD only.
-- The demo teacher (Ana Ruiz, delivered+help-demo@resend.dev) and her
-- community "salsa-with-ana" are created through the app first (see README.md).
-- This adds courses and live classes once; running it again changes nothing.
DO $$
DECLARE
  cid uuid;
  uid text;
  co uuid;
  ch uuid;
  course_titles text[] := ARRAY['Salsa Basics', 'Turns and Partnerwork', 'Shines and Styling'];
  chapter_titles text[] := ARRAY[
    'Your first basic step', 'Timing and the music', 'Side and back basics',
    'Right turns', 'Cross body lead', 'Combining turns',
    'Footwork shines', 'Arm styling', 'Your first routine'];
  i int;
  j int;
  k int;
BEGIN
  SELECT id, created_by INTO cid, uid FROM communities WHERE slug = 'salsa-with-ana';
  IF cid IS NULL THEN
    RAISE EXCEPTION 'Create the salsa-with-ana community first';
  END IF;
  IF EXISTS (SELECT 1 FROM courses WHERE community_id = cid) THEN
    RAISE NOTICE 'Courses already seeded';
  ELSE
    FOR i IN 1..3 LOOP
      INSERT INTO courses (title, description, slug, community_id, created_by, is_public, position, created_at, updated_at)
      VALUES (
        course_titles[i],
        CASE i WHEN 1 THEN 'Start here: the basic step, timing and your first combinations.'
               WHEN 2 THEN 'Lead and follow turns with a partner, one move at a time.'
               ELSE 'Footwork and arm styling to make your salsa your own.' END,
        lower(replace(course_titles[i], ' ', '-')), cid, uid, true, i,
        now() - make_interval(days => 60 - i * 10), now())
      RETURNING id INTO co;
      FOR j IN 1..3 LOOP
        INSERT INTO chapters (title, chapter_position, course_id)
        VALUES (chapter_titles[(i - 1) * 3 + j], j, co)
        RETURNING id INTO ch;
        FOR k IN 1..3 LOOP
          INSERT INTO lessons (title, content, lesson_position, chapter_id, is_preview)
          VALUES ('Lesson ' || k, '<p>Practice notes for this lesson.</p>', k, ch, i = 1 AND j = 1 AND k = 1);
        END LOOP;
      END LOOP;
    END LOOP;
  END IF;

  -- No borrowed cover: the app's own placeholder, with the community's name.
  UPDATE communities SET image_url = NULL WHERE id = cid AND image_url IS NOT NULL;

  -- A few fictional members, so the community doesn't look empty. They can't
  -- sign in (no account row) and their addresses are Resend test addresses.
  IF NOT EXISTS (SELECT 1 FROM community_members WHERE community_id = cid AND user_id <> uid) THEN
    WITH people(n, name) AS (
      VALUES (1, 'Lucía Gómez'), (2, 'Marco Rossi'), (3, 'Sara Lindqvist'), (4, 'Diego Fernández'),
             (5, 'Emma Novak'), (6, 'Tomás Silva'), (7, 'Nina Petrova'), (8, 'Yuki Tanaka')
    ), users AS (
      INSERT INTO "user" (id, name, email, "emailVerified")
      SELECT 'help-demo-member-' || n, name, 'delivered+help-member-' || n || '@resend.dev', true FROM people
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name, email
    ), profiles_added AS (
      INSERT INTO profiles (id, auth_user_id, full_name, email)
      SELECT gen_random_uuid(), id, name, email FROM users
      WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.auth_user_id = users.id)
    )
    INSERT INTO community_members (user_id, community_id, role, status, joined_at)
    SELECT id, cid, 'member', 'active', now() - make_interval(days => (random() * 30)::int) FROM users;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM live_classes WHERE community_id = cid) THEN
    -- reminder_sent_at is set so preprod's reminder cron never emails anyone.
    INSERT INTO live_classes (community_id, teacher_id, title, description, scheduled_start_time, duration_minutes, reminder_sent_at)
    VALUES
      (cid, uid, 'Salsa Basics: live practice', 'Bring comfortable shoes.', date_trunc('day', now()) + interval '2 days 19 hours', 60, now()),
      (cid, uid, 'Turns workshop', 'Right turns and cross body lead.', date_trunc('day', now()) + interval '5 days 19 hours', 60, now());
  END IF;
END $$;
