import { NextResponse } from 'next/server';
import { queryOne, sql } from '@/lib/db';
import { getSession } from '@/lib/auth-session';
import { userCanManageCommunity } from '@/lib/community-auth';
import { checkCommunitySlug } from '@/lib/community-slug';
import {
  resolveStatusChange,
  PRE_REGISTERED_STATUSES,
  PRE_REGISTRATIONS_LOCK_MESSAGE,
} from '@/lib/community-status';

interface Community {
  id: string;
  slug: string;
  status: string | null;
  opening_date: Date | string | null;
  can_change_opening_date: boolean | null;
}

interface UpdatedCommunity {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  custom_links: any[] | null;
  slug: string;
}

export async function PUT(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    const { communitySlug } = params;
    const updates = await request.json();

    // Get the community by slug
    const community = await queryOne<Community>`
      SELECT id, slug, status, opening_date, can_change_opening_date
      FROM communities
      WHERE slug = ${communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: 'Community not found' },
        { status: 404 }
      );
    }

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!(await userCanManageCommunity(session.user.id, community.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // This route PUTs every column unconditionally, so a blank name (or one that
    // slugifies to nothing) would wipe the community's name and move it to the
    // site root, where every link to it lands on the home page instead.
    const name = typeof updates.name === 'string' ? updates.name.trim() : '';
    if (!name) {
      return NextResponse.json(
        { error: 'Community name is required' },
        { status: 400 }
      );
    }

    // Same slug rule as create, so the stored slug is always one safe path
    // segment that doesn't shadow an app route.
    const slugCheck = checkCommunitySlug(updates.slug);
    if (!slugCheck.ok) {
      return NextResponse.json({ error: slugCheck.error }, { status: 400 });
    }
    const slug = slugCheck.slug;

    // If slug is being updated, check if it's already taken (ignoring case,
    // so "salsa-paris" can't sit next to an older "Salsa-Paris").
    if (slug !== community.slug) {
      const existingCommunity = await queryOne<{ id: string }>`
        SELECT id
        FROM communities
        WHERE LOWER(slug) = ${slug}
          AND id != ${community.id}
      `;

      if (existingCommunity) {
        return NextResponse.json(
          { error: 'A community with this URL already exists' },
          { status: 400 }
        );
      }
    }

    // Status and opening date: allow-listed values, the platform's date lock,
    // and a future date for pre-registration.
    const statusChange = resolveStatusChange(community, {
      status: updates.status,
      openingDate: updates.opening_date,
    });
    if (!statusChange.ok) {
      return NextResponse.json({ error: statusChange.error }, { status: statusChange.httpStatus });
    }

    // Pre-registration subscriptions charge first on the opening date they
    // were created with. Changing the date or the status would leave those
    // charges where they are, so once anyone has pre-registered we do it.
    if (statusChange.changed) {
      const preRegistered = await queryOne<{ count: number }>`
        SELECT COUNT(*)::int AS count
        FROM community_members
        WHERE community_id = ${community.id}
          AND status = ANY(${PRE_REGISTERED_STATUSES as string[]})
      `;
      if ((preRegistered?.count ?? 0) > 0) {
        return NextResponse.json({ error: PRE_REGISTRATIONS_LOCK_MESSAGE }, { status: 409 });
      }
    }

    // Update the community
    const updatedCommunity = await queryOne<UpdatedCommunity>`
      UPDATE communities
      SET
        name = ${name},
        description = ${updates.description},
        image_url = ${updates.imageUrl},
        custom_links = ${sql.json(Array.isArray(updates.customLinks) ? updates.customLinks : [])},
        slug = ${slug},
        status = ${statusChange.status},
        opening_date = ${statusChange.openingDate},
        updated_at = NOW()
      WHERE id = ${community.id}
      RETURNING *
    `;

    if (!updatedCommunity) {
      console.error('Error updating community: No rows returned');
      return NextResponse.json(
        { error: 'Failed to update community' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        name: updatedCommunity.name,
        description: updatedCommunity.description,
        imageUrl: updatedCommunity.image_url,
        customLinks: updatedCommunity.custom_links || [],
        slug: updatedCommunity.slug,
      }
    });
  } catch (error) {
    console.error('Error updating community:', error);
    return NextResponse.json(
      { error: 'Failed to update community' },
      { status: 500 }
    );
  }
}
