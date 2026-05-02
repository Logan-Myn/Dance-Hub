import { NextRequest, NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";

interface EmailPreferences {
  id: string;
  user_id: string;
  email: string;
  unsubscribe_token: string;
  marketing_emails: boolean;
  course_announcements: boolean;
  teacher_broadcast: boolean;
  unsubscribed_all: boolean;
  unsubscribed_at: string | null;
  created_at: string;
  updated_at: string;
}

// session.user.id is the Better Auth text id; email_preferences.user_id is
// the profiles.id UUID. Resolve through profiles before any query.
async function resolveProfile(authUserId: string): Promise<{ id: string; email: string | null } | null> {
  return queryOne<{ id: string; email: string | null }>`
    SELECT id, email FROM profiles WHERE auth_user_id = ${authUserId}
  `;
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await resolveProfile(session.user.id);
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    let preferences = await queryOne<EmailPreferences>`
      SELECT *
      FROM email_preferences
      WHERE user_id = ${profile.id}
    `;

    if (!preferences) {
      preferences = await queryOne<EmailPreferences>`
        INSERT INTO email_preferences (user_id, email)
        VALUES (${profile.id}, ${profile.email ?? session.user.email})
        RETURNING *
      `;

      if (!preferences) {
        return NextResponse.json({ error: "Failed to create preferences" }, { status: 500 });
      }
    }

    return NextResponse.json({ preferences });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await resolveProfile(session.user.id);
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const updates = await request.json();

    const preferences = await queryOne<EmailPreferences>`
      UPDATE email_preferences
      SET
        marketing_emails = COALESCE(${updates.marketing_emails ?? null}, marketing_emails),
        course_announcements = COALESCE(${updates.course_announcements ?? null}, course_announcements),
        teacher_broadcast = COALESCE(${updates.teacher_broadcast ?? null}, teacher_broadcast),
        unsubscribed_all = COALESCE(${updates.unsubscribed_all ?? null}, unsubscribed_all),
        updated_at = NOW()
      WHERE user_id = ${profile.id}
      RETURNING *
    `;

    if (!preferences) {
      return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 });
    }

    await sql`
      INSERT INTO email_events (user_id, email, event_type, email_type, metadata)
      VALUES (
        ${profile.id},
        ${preferences.email},
        'preferences_updated',
        'preferences',
        ${JSON.stringify({ updates })}::jsonb
      )
    `;

    return NextResponse.json({
      message: "Preferences updated successfully",
      preferences,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
