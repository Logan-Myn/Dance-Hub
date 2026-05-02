import { NextRequest, NextResponse } from "next/server";
import { queryOne, sql } from "@/lib/db";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://dance-hub.io';

interface EmailPreferences {
  user_id: string;
  email: string;
  unsubscribe_token: string;
  marketing_emails: boolean;
  course_announcements: boolean;
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

    const communityId = request.nextUrl.searchParams.get('community_id');

    if (communityId && type === 'teacher_broadcast') {
      // Per-community opt-out: flip just this one (user, community) row.
      // Fetch the community name now so the success page can render
      // "Unsubscribed from {Community}".
      const community = await queryOne<{ id: string; name: string }>`
        SELECT id, name FROM communities WHERE id = ${communityId}
      `;
      if (community) {
        await sql`
          INSERT INTO community_email_preferences
            (user_id, community_id, broadcasts_enabled, unsubscribed_at)
          VALUES (${preferences.user_id}, ${community.id}, false, NOW())
          ON CONFLICT (user_id, community_id) DO UPDATE
            SET broadcasts_enabled = false,
                unsubscribed_at = NOW(),
                updated_at = NOW()
        `;
        await sql`
          INSERT INTO email_events (user_id, email, event_type, email_type, metadata)
          VALUES (
            ${preferences.user_id},
            ${preferences.email},
            'unsubscribed',
            'teacher_broadcast',
            ${JSON.stringify({ token, type, community_id: community.id })}::jsonb
          )
        `;
        const successUrl = new URL('/unsubscribe/success', SITE_URL);
        successUrl.searchParams.set('community', community.name);
        return NextResponse.redirect(successUrl);
      }
      // If community_id is bogus, fall through to the default category path.
      // We still honor the unsubscribe click — better to global-opt-out the user
      // than to fail their click because the URL was tampered with.
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
      SELECT user_id, email, marketing_emails, course_announcements, teacher_broadcast
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
