import { query } from "@/lib/db";

export interface CalendarClass {
  kind: "class";
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  durationMinutes: number;
  status: string;
  seriesId: string | null;
  enableRecording: boolean;
  teacherName: string;
  /** Recording turned into a replay lesson, and whether the viewer watched it. */
  replay: { lessonId: string; watched: boolean } | null;
}

export interface CalendarLesson {
  kind: "lesson";
  id: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
  role: "student" | "teacher";
  /** The other person: the teacher for a student, the student for a teacher. */
  withName: string;
  pricePaid: number | null;
}

export type CalendarItem = CalendarClass | CalendarLesson;

const iso = (v: Date | string) => new Date(v).toISOString();

/**
 * Live classes in [start, end) plus the viewer's own private lessons in the
 * same window. Lessons are looked up by the session user only, and carry no
 * contact details or notes.
 */
export async function getCalendarItems(opts: {
  communityId: string;
  viewerId: string;
  start: string;
  end: string;
  includeReplays: boolean;
  includeLessons: boolean;
}): Promise<CalendarItem[]> {
  const { communityId, viewerId, start, end } = opts;
  const classes = await query<{
    id: string; title: string; description: string | null; scheduled_start_time: Date | string;
    duration_minutes: number; status: string; series_id: string | null; enable_recording: boolean | null;
    teacher_name: string | null; lesson_id: string | null; watched: boolean;
  }>`
    SELECT lc.id, lc.title, lc.description, lc.scheduled_start_time, lc.duration_minutes, lc.status,
           lc.series_id, lc.enable_recording,
           COALESCE(NULLIF(p.display_name, ''), NULLIF(p.full_name, ''), u.name) AS teacher_name,
           r.lesson_id, (comp.id IS NOT NULL) AS watched
    FROM live_classes lc
    JOIN "user" u ON u.id = lc.teacher_id
    LEFT JOIN profiles p ON p.auth_user_id = lc.teacher_id
    LEFT JOIN LATERAL (
      SELECT lesson_id FROM live_class_recordings
      WHERE live_class_id = lc.id AND status = 'ready' AND lesson_id IS NOT NULL
      ORDER BY created_at DESC LIMIT 1
    ) r ON true
    LEFT JOIN lesson_completions comp ON comp.lesson_id = r.lesson_id AND comp.user_id = ${viewerId}
    WHERE lc.community_id = ${communityId}
      AND lc.scheduled_start_time >= ${start}::timestamptz
      AND lc.scheduled_start_time < ${end}::timestamptz
    ORDER BY lc.scheduled_start_time ASC
    LIMIT 500
  `;

  const items: CalendarItem[] = classes.map((c) => ({
    kind: "class",
    id: c.id,
    title: c.title,
    description: c.description,
    startsAt: iso(c.scheduled_start_time),
    durationMinutes: c.duration_minutes,
    status: c.status,
    seriesId: c.series_id,
    enableRecording: !!c.enable_recording,
    teacherName: c.teacher_name || "the teacher",
    replay: opts.includeReplays && c.lesson_id ? { lessonId: c.lesson_id, watched: c.watched } : null,
  }));

  if (opts.includeLessons) {
    const lessons = await query<{
      id: string; scheduled_at: Date | string; price_paid: string | number | null; student_id: string;
      student_name: string | null; title: string; duration_minutes: number; teacher_id: string | null;
      created_by: string; teacher_name: string | null;
    }>`
      SELECT lb.id, lb.scheduled_at, lb.price_paid, lb.student_id, lb.student_name,
             pl.title, pl.duration_minutes, pl.teacher_id, c.created_by,
             COALESCE(NULLIF(tp.display_name, ''), NULLIF(tp.full_name, ''), 'your teacher') AS teacher_name
      FROM lesson_bookings lb
      JOIN private_lessons pl ON pl.id = lb.private_lesson_id
      JOIN communities c ON c.id = lb.community_id
      LEFT JOIN profiles tp ON tp.auth_user_id = COALESCE(pl.teacher_id, c.created_by)
      WHERE lb.community_id = ${communityId}
        AND lb.payment_status = 'succeeded'
        AND lb.lesson_status <> 'canceled'
        AND lb.scheduled_at IS NOT NULL
        AND lb.scheduled_at >= ${start}::timestamptz
        AND lb.scheduled_at < ${end}::timestamptz
        AND (lb.student_id = ${viewerId} OR pl.teacher_id = ${viewerId} OR c.created_by = ${viewerId})
      ORDER BY lb.scheduled_at ASC
      LIMIT 200
    `;
    for (const l of lessons) {
      const isStudent = l.student_id === viewerId;
      items.push({
        kind: "lesson",
        id: l.id,
        title: l.title,
        startsAt: iso(l.scheduled_at),
        durationMinutes: l.duration_minutes,
        role: isStudent ? "student" : "teacher",
        withName: isStudent ? l.teacher_name || "your teacher" : l.student_name || "a student",
        pricePaid: isStudent && l.price_paid != null ? Number(l.price_paid) : null,
      });
    }
  }

  return items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
