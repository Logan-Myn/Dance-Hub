import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { sql } from '@/lib/db';
import { getUserIsAdmin } from '@/lib/community-data';

// GET: Fetch profile (current user or by userId query param).
// Signed-in users only. Another user's profile is reduced to public fields
// unless the caller is a platform admin.
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId') || session.user.id;

    const profiles = await sql`
      SELECT id, full_name, display_name, avatar_url, email, is_admin, auth_user_id, timezone
      FROM profiles
      WHERE auth_user_id = ${targetUserId}
    `;

    if (profiles.length === 0) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    const profile = profiles[0];
    if (targetUserId !== session.user.id && !(await getUserIsAdmin(session.user.id))) {
      return NextResponse.json({
        id: profile.id,
        full_name: profile.full_name,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        auth_user_id: profile.auth_user_id,
      });
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

// PUT: Update current user's profile
export async function PUT(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { fullName, displayName, avatarUrl, timezone } = await request.json();

    if (timezone !== undefined) {
      let validZones: string[];
      try {
        validZones = Intl.supportedValuesOf('timeZone');
      } catch {
        validZones = [];
      }
      if (validZones.length > 0 && !validZones.includes(timezone)) {
        return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 });
      }
    }

    // Check display name uniqueness if provided
    if (displayName) {
      const existing = await sql`
        SELECT id FROM profiles
        WHERE display_name = ${displayName} AND auth_user_id != ${session.user.id}
        LIMIT 1
      `;

      if (existing.length > 0) {
        return NextResponse.json(
          { error: 'This display name is already taken' },
          { status: 400 }
        );
      }
    }

    await sql`
      UPDATE profiles
      SET
        full_name    = COALESCE(${fullName ?? null}, full_name),
        display_name = CASE WHEN ${displayName !== undefined}
                           THEN ${displayName ?? null}
                           ELSE display_name END,
        avatar_url   = COALESCE(${avatarUrl ?? null}, avatar_url),
        timezone     = COALESCE(${timezone ?? null}, timezone),
        updated_at   = NOW()
      WHERE auth_user_id = ${session.user.id}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
