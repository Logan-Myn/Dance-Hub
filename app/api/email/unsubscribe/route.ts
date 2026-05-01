import { NextRequest, NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://dance-hub.io';

interface EmailPreferences {
  user_id: string;
  email: string;
  unsubscribe_token: string;
  marketing_emails: boolean;
  course_announcements: boolean;
  community_updates: boolean;
  weekly_digest: boolean;
  teacher_broadcast: boolean;
  unsubscribed_all: boolean;
}

async function unsubscribeOneCategory(token: string, type: string): Promise<boolean> {
  switch (type) {
    case 'marketing':
      await sql`UPDATE email_preferences SET marketing_emails = false, updated_at = NOW() WHERE unsubscribe_token = ${token}`;
      return true;
    case 'course_announcements':
      await sql`UPDATE email_preferences SET course_announcements = false, updated_at = NOW() WHERE unsubscribe_token = ${token}`;
      return true;
    case 'community_updates':
      await sql`UPDATE email_preferences SET community_updates = false, updated_at = NOW() WHERE unsubscribe_token = ${token}`;
      return true;
    case 'weekly_digest':
      await sql`UPDATE email_preferences SET weekly_digest = false, updated_at = NOW() WHERE unsubscribe_token = ${token}`;
      return true;
    case 'teacher_broadcast':
      await sql`UPDATE email_preferences SET teacher_broadcast = false, updated_at = NOW() WHERE unsubscribe_token = ${token}`;
      return true;
    default:
      return false;
  }
}

async function unsubscribeAllNonTransactional(token: string) {
  await sql`
    UPDATE email_preferences
    SET
      marketing_emails = false,
      course_announcements = false,
      community_updates = false,
      weekly_digest = false,
      teacher_broadcast = false,
      unsubscribed_all = true,
      unsubscribed_at = NOW(),
      updated_at = NOW()
    WHERE unsubscribe_token = ${token}
  `;
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    const type = request.nextUrl.searchParams.get('type');

    if (!token) {
      return NextResponse.redirect(new URL('/unsubscribe/error', SITE_URL));
    }

    const preferences = await queryOne<EmailPreferences>`
      SELECT user_id, email, unsubscribe_token
      FROM email_preferences
      WHERE unsubscribe_token = ${token}
    `;

    if (!preferences) {
      return NextResponse.redirect(new URL('/unsubscribe/invalid', SITE_URL));
    }

    const handled = type ? await unsubscribeOneCategory(token, type) : false;
    if (!handled) {
      await unsubscribeAllNonTransactional(token);
    }

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

    return NextResponse.redirect(new URL('/unsubscribe/success', SITE_URL));
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return NextResponse.redirect(new URL('/unsubscribe/error', SITE_URL));
  }
}

export async function POST(request: NextRequest) {
  try {
    const { token, preferences: newPreferences } = await request.json();

    if (!token) {
      return NextResponse.json({ error: "Missing unsubscribe token" }, { status: 400 });
    }

    const existing = await queryOne<EmailPreferences>`
      SELECT user_id, email, marketing_emails, course_announcements, community_updates, weekly_digest, teacher_broadcast
      FROM email_preferences
      WHERE unsubscribe_token = ${token}
    `;

    if (!existing) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    await sql`
      UPDATE email_preferences
      SET
        marketing_emails = ${newPreferences.marketing_emails ?? existing.marketing_emails},
        course_announcements = ${newPreferences.course_announcements ?? existing.course_announcements},
        community_updates = ${newPreferences.community_updates ?? existing.community_updates},
        weekly_digest = ${newPreferences.weekly_digest ?? existing.weekly_digest},
        teacher_broadcast = ${newPreferences.teacher_broadcast ?? existing.teacher_broadcast},
        unsubscribed_all = false,
        updated_at = NOW()
      WHERE unsubscribe_token = ${token}
    `;

    await sql`
      INSERT INTO email_events (user_id, email, event_type, email_type, metadata)
      VALUES (
        ${existing.user_id},
        ${existing.email},
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
