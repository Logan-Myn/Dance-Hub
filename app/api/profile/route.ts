import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { sql } from '@/lib/db';

// GET: Fetch profile (current user or by userId query param)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get('userId');

    // If userId is provided, fetch that specific profile (userId is Better Auth user ID)
    if (requestedUserId) {
      const profiles = await sql`
        SELECT id, full_name, display_name, avatar_url, email, is_admin, auth_user_id, timezone
        FROM profiles
        WHERE auth_user_id = ${requestedUserId}
      `;

      if (profiles.length === 0) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(profiles[0]);
    }

    // Otherwise, fetch current user's profile (requires auth)
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const profiles = await sql`
      SELECT id, full_name, display_name, avatar_url, email, is_admin, auth_user_id, timezone
      FROM profiles
      WHERE auth_user_id = ${session.user.id}
    `;

    if (profiles.length === 0) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(profiles[0]);
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
