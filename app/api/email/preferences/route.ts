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
  unsubscribed_all: boolean;
  unsubscribed_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function GET() {
  try {
    // Get the current user
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const user = session.user;

    // Get user's email preferences
    let preferences = await queryOne<EmailPreferences>`
      SELECT *
      FROM email_preferences
      WHERE user_id = ${user.id}
    `;

    if (!preferences) {
      // If no preferences exist, create default ones
      preferences = await queryOne<EmailPreferences>`
        INSERT INTO email_preferences (user_id, email)
        VALUES (${user.id}, ${user.email})
        RETURNING *
      `;

      if (!preferences) {
        console.error('Error creating preferences: no row returned');
        return NextResponse.json(
          { error: "Failed to create preferences" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ preferences });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Get the current user
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const user = session.user;
    const updates = await request.json();

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.user_id;
    delete updates.email;
    delete updates.unsubscribe_token;
    delete updates.created_at;

    // Build dynamic update query based on provided fields
    const preferences = await queryOne<EmailPreferences>`
      UPDATE email_preferences
      SET
        marketing_emails = COALESCE(${updates.marketing_emails ?? null}, marketing_emails),
        course_announcements = COALESCE(${updates.course_announcements ?? null}, course_announcements),
        teacher_broadcast = COALESCE(${updates.teacher_broadcast ?? null}, teacher_broadcast),
        unsubscribed_all = COALESCE(${updates.unsubscribed_all ?? null}, unsubscribed_all),
        updated_at = NOW()
      WHERE user_id = ${user.id}
      RETURNING *
    `;

    if (!preferences) {
      console.error('Error updating preferences: no row returned');
      return NextResponse.json(
        { error: "Failed to update preferences" },
        { status: 500 }
      );
    }

    // Log the preference update
    await sql`
      INSERT INTO email_events (user_id, email, event_type, email_type, metadata)
      VALUES (
        ${user.id},
        ${user.email},
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
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
