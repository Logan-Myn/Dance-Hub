import { NextRequest, NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";

interface EmailPreferences {
  id: string;
  user_id: string;
  email: string;
  unsubscribe_token: string;
  marketing_emails: boolean;
  course_announcements: boolean;
  community_updates: boolean;
  weekly_digest: boolean;
  unsubscribed_all: boolean;
  unsubscribed_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get('token');
    const type = searchParams.get('type'); // Optional: specific email type to unsubscribe from

    if (!token) {
      return NextResponse.redirect(new URL('/unsubscribe/error', process.env.NEXT_PUBLIC_SITE_URL || 'https://dance-hub.io'));
    }

    // Find the email preferences by unsubscribe token
    const preferences = await queryOne<EmailPreferences>`
      SELECT *
      FROM email_preferences
      WHERE unsubscribe_token = ${token}
    `;

    if (!preferences) {
      console.error('Error fetching preferences: not found');
      return NextResponse.redirect(new URL('/unsubscribe/invalid', process.env.NEXT_PUBLIC_SITE_URL || 'https://dance-hub.io'));
    }

    // Update preferences based on type
    if (type) {
      // Unsubscribe from specific type
      switch (type) {
        case 'marketing':
          await sql`
            UPDATE email_preferences
            SET marketing_emails = false, updated_at = NOW()
            WHERE unsubscribe_token = ${token}
          `;
          break;
        case 'course_announcements':
          await sql`
            UPDATE email_preferences
            SET course_announcements = false, updated_at = NOW()
            WHERE unsubscribe_token = ${token}
          `;
          break;
        case 'community_updates':
          await sql`
            UPDATE email_preferences
            SET community_updates = false, updated_at = NOW()
            WHERE unsubscribe_token = ${token}
          `;
          break;
        case 'weekly_digest':
          await sql`
            UPDATE email_preferences
            SET weekly_digest = false, updated_at = NOW()
            WHERE unsubscribe_token = ${token}
          `;
          break;
        case 'teacher_broadcast':
          await sql`
            UPDATE email_preferences
            SET teacher_broadcast = false, updated_at = NOW()
            WHERE unsubscribe_token = ${token}
          `;
          break;
        default:
          // Unknown type, unsubscribe from all non-transactional
          await sql`
            UPDATE email_preferences
            SET
              marketing_emails = false,
              course_announcements = false,
              community_updates = false,
              weekly_digest = false,
              updated_at = NOW()
            WHERE unsubscribe_token = ${token}
          `;
      }
    } else {
      // Unsubscribe from all non-transactional emails
      await sql`
        UPDATE email_preferences
        SET
          marketing_emails = false,
          course_announcements = false,
          community_updates = false,
          weekly_digest = false,
          unsubscribed_all = true,
          unsubscribed_at = NOW(),
          updated_at = NOW()
        WHERE unsubscribe_token = ${token}
      `;
    }

    // Log the unsubscribe event
    await sql`
      INSERT INTO email_events (user_id, email, event_type, email_type, metadata)
      VALUES (
        ${preferences.user_id},
        ${preferences.email},
        'unsubscribed',
        ${type || 'all_marketing'},
        ${JSON.stringify({ token, type })}::jsonb
      )
    `;

    // Redirect to success page
    return NextResponse.redirect(new URL('/unsubscribe/success', process.env.NEXT_PUBLIC_SITE_URL || 'https://dance-hub.io'));
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return NextResponse.redirect(new URL('/unsubscribe/error', process.env.NEXT_PUBLIC_SITE_URL || 'https://dance-hub.io'));
  }
}

export async function POST(request: NextRequest) {
  try {
    const { token, preferences: newPreferences } = await request.json();

    if (!token) {
      return NextResponse.json(
        { error: "Missing unsubscribe token" },
        { status: 400 }
      );
    }

    // Find the email preferences by unsubscribe token
    const existingPreferences = await queryOne<EmailPreferences>`
      SELECT *
      FROM email_preferences
      WHERE unsubscribe_token = ${token}
    `;

    if (!existingPreferences) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 400 }
      );
    }

    // Update preferences
    await sql`
      UPDATE email_preferences
      SET
        marketing_emails = ${newPreferences.marketing_emails ?? existingPreferences.marketing_emails},
        course_announcements = ${newPreferences.course_announcements ?? existingPreferences.course_announcements},
        community_updates = ${newPreferences.community_updates ?? existingPreferences.community_updates},
        weekly_digest = ${newPreferences.weekly_digest ?? existingPreferences.weekly_digest},
        unsubscribed_all = false,
        updated_at = NOW()
      WHERE unsubscribe_token = ${token}
    `;

    // Log the preference update
    await sql`
      INSERT INTO email_events (user_id, email, event_type, email_type, metadata)
      VALUES (
        ${existingPreferences.user_id},
        ${existingPreferences.email},
        'preferences_updated',
        'preferences',
        ${JSON.stringify({ newPreferences })}::jsonb
      )
    `;

    return NextResponse.json({
      message: "Preferences updated successfully",
      preferences: newPreferences,
    });
  } catch (error) {
    console.error('Preferences update error:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
