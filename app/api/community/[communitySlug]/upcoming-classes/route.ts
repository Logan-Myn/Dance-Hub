import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";

// Force dynamic - no caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Community {
  id: string;
}

interface UpcomingClass {
  id: string;
  title: string;
  scheduled_start_time: string;
  duration_minutes: number;
  status: string;
  teacher_name: string;
  teacher_avatar_url: string | null;
  is_currently_active: boolean;
  is_starting_soon: boolean;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { communitySlug: string } }
) {
  try {
    const community = await queryOne<Community>`
      SELECT id FROM communities WHERE slug = ${params.communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    const classes = await query<UpcomingClass>`
      SELECT id, title, scheduled_start_time, duration_minutes, status,
             teacher_name, teacher_avatar_url, is_currently_active, is_starting_soon
      FROM live_classes_with_details
      WHERE community_id = ${community.id}
        AND (status = 'scheduled' OR status = 'live')
        AND scheduled_start_time >= NOW() - INTERVAL '2 hours'
        AND scheduled_start_time <= NOW() + INTERVAL '14 days'
      ORDER BY
        CASE WHEN status = 'live' THEN 0 ELSE 1 END,
        scheduled_start_time ASC
      LIMIT 5
    `;

    return NextResponse.json(classes);
  } catch (error) {
    console.error("Error fetching upcoming classes:", error);
    return NextResponse.json(
      { error: "Failed to fetch upcoming classes" },
      { status: 500 }
    );
  }
}
