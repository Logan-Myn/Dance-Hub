import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { createRoom } from "@/lib/stream-hub";
import { isValidTimeZone, weeklyStarts } from "@/lib/calendar/series";
import { requireCommunityViewer } from "@/lib/community-auth";
import { parseRangeParams } from "@/lib/calendar-week";

interface Community {
  id: string;
  created_by: string;
}

interface LiveClassWithDetails {
  id: string;
  community_id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  scheduled_start_time: string;
  duration_minutes: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface LiveClass {
  id: string;
  community_id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  scheduled_start_time: string;
  duration_minutes: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ communitySlug: string }> }
) {
  const params = await props.params;
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    // Members only, like the calendar page.
    const guard = await requireCommunityViewer(params.communitySlug);
    if (!guard.ok) return guard.response;
    const community = guard.community;

    // Build query for live classes with optional date filtering
    let liveClasses: LiveClassWithDetails[];

    if (start && end) {
      // The calendar sends its week as UTC instants (start inclusive, end
      // exclusive), worked out in the viewer's timezone.
      const range = parseRangeParams(start, end);
      if (!range) {
        return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
      }
      liveClasses = await query<LiveClassWithDetails>`
        SELECT *
        FROM live_classes_with_details
        WHERE community_id = ${community.id}
          AND scheduled_start_time >= ${range.start.toISOString()}
          AND scheduled_start_time < ${range.end.toISOString()}
        ORDER BY scheduled_start_time ASC
      `;
    } else {
      liveClasses = await query<LiveClassWithDetails>`
        SELECT *
        FROM live_classes_with_details
        WHERE community_id = ${community.id}
        ORDER BY scheduled_start_time ASC
      `;
    }

    return NextResponse.json(liveClasses || []);
  } catch (error) {
    console.error("Error in live classes GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ communitySlug: string }> }
) {
  const params = await props.params;
  try {
    // Get the current user session
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const user = session.user;

    // Get community by slug
    const community = await queryOne<Community>`
      SELECT id, created_by
      FROM communities
      WHERE slug = ${params.communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    // Check if user is authorized (community creator or will add teacher role check later)
    if (community.created_by !== user.id) {
      // TODO: Add check for teacher role in the community
      return NextResponse.json(
        { error: "Not authorized to create live classes" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { title, description, scheduled_start_time, duration_minutes, enable_recording, repeat_weeks, time_zone } = body;

    // Validate required fields
    if (!title || !scheduled_start_time || !duration_minutes) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    const firstStart = new Date(scheduled_start_time);
    if (Number.isNaN(firstStart.getTime())) {
      return NextResponse.json({ error: "Invalid start time" }, { status: 400 });
    }
    if (firstStart.getTime() < Date.now() - 5 * 60_000) {
      return NextResponse.json({ error: "Pick a time in the future." }, { status: 400 });
    }

    // "Repeat weekly for N weeks": create every class at once, same wall-clock
    // time in the teacher's zone, in one transaction.
    const weeks = Number(repeat_weeks) || 1;
    if (weeks > 1) {
      if (!isValidTimeZone(time_zone)) {
        return NextResponse.json({ error: "A valid time zone is required to repeat a class" }, { status: 400 });
      }
      const durationMin = parseInt(duration_minutes);
      const starts = weeklyStarts(firstStart, time_zone, weeks);
      try {
        const created = await sql.begin(async (tx) => {
          const seriesId = crypto.randomUUID();
          const rows: LiveClass[] = [];
          for (const start of starts) {
            const end = new Date(start.getTime() + durationMin * 60_000);
            const [clash] = await tx<{ title: string; scheduled_start_time: string }[]>`
              SELECT title, scheduled_start_time FROM live_classes
              WHERE community_id = ${community.id} AND teacher_id = ${user.id}
                AND status NOT IN ('cancelled', 'ended')
                AND scheduled_start_time < ${end.toISOString()}::timestamptz
                AND (scheduled_start_time + (duration_minutes || ' minutes')::interval) > ${start.toISOString()}::timestamptz
              LIMIT 1
            `;
            if (clash) {
              throw Object.assign(new Error("overlap"), { clash });
            }
            const [row] = await tx<LiveClass[]>`
              INSERT INTO live_classes (community_id, teacher_id, title, description, scheduled_start_time, duration_minutes, enable_recording, series_id)
              VALUES (${community.id}, ${user.id}, ${title}, ${description || null}, ${start.toISOString()}, ${durationMin}, ${enable_recording === true}, ${seriesId})
              RETURNING *
            `;
            rows.push(row);
          }
          return rows;
        });
        // Video rooms are created when someone joins (the video-token route).
        return NextResponse.json({ classes: created }, { status: 201 });
      } catch (error) {
        const clash = (error as { clash?: { title: string; scheduled_start_time: string } }).clash;
        if (clash) {
          return NextResponse.json(
            {
              error: `One of these dates overlaps with "${clash.title}". Pick a different time or fewer weeks.`,
              conflict_at: new Date(clash.scheduled_start_time).toISOString(),
            },
            { status: 409 }
          );
        }
        throw error;
      }
    }

    // Reject if this teacher already has a non-cancelled / non-ended class
    // whose time window overlaps the new one. Two windows overlap iff
    // newStart < existingEnd && newEnd > existingStart.
    const newDurationMin = parseInt(duration_minutes);
    const newStart = new Date(scheduled_start_time);
    const newEnd = new Date(newStart.getTime() + newDurationMin * 60000);
    const conflict = await queryOne<{ id: string; title: string; scheduled_start_time: string }>`
      SELECT id, title, scheduled_start_time
      FROM live_classes
      WHERE community_id = ${community.id}
        AND teacher_id = ${user.id}
        AND status NOT IN ('cancelled', 'ended')
        AND scheduled_start_time < ${newEnd.toISOString()}::timestamptz
        AND (scheduled_start_time + (duration_minutes || ' minutes')::interval) > ${newStart.toISOString()}::timestamptz
      LIMIT 1
    `;
    if (conflict) {
      return NextResponse.json(
        {
          error: `This time overlaps with "${conflict.title}". Pick a different time.`,
          conflict_at: new Date(conflict.scheduled_start_time).toISOString(),
        },
        { status: 409 }
      );
    }

    // Create the live class
    const liveClass = await queryOne<LiveClass>`
      INSERT INTO live_classes (
        community_id,
        teacher_id,
        title,
        description,
        scheduled_start_time,
        duration_minutes,
        enable_recording
      ) VALUES (
        ${community.id},
        ${user.id},
        ${title},
        ${description || null},
        ${scheduled_start_time},
        ${parseInt(duration_minutes)},
        ${enable_recording === true}
      )
      RETURNING *
    `;

    if (!liveClass) {
      console.error("Error creating live class: no row returned");
      return NextResponse.json(
        { error: "Failed to create live class" },
        { status: 500 }
      );
    }

    // Create Stream-Hub/LiveKit room for the live class
    try {
      const roomName = `live-class-${liveClass.id}`;
      await createRoom(roomName, 100);
      await sql`
        UPDATE live_classes SET livekit_room_name = ${roomName}, updated_at = NOW()
        WHERE id = ${liveClass.id}
      `;
    } catch (error) {
      console.error("Warning: Failed to create video room for live class:", error);
      // Don't fail the entire request - the room can be created later on join
    }

    return NextResponse.json(liveClass, { status: 201 });
  } catch (error) {
    console.error("Error in live classes POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
