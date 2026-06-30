import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

interface Community {
  id: string;
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
      SELECT id
      FROM communities
      WHERE slug = ${communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: 'Community not found' },
        { status: 404 }
      );
    }

    // If slug is being updated, check if it's already taken
    if (updates.slug && updates.slug !== communitySlug) {
      const existingCommunity = await queryOne<Community>`
        SELECT id
        FROM communities
        WHERE slug = ${updates.slug}
          AND id != ${community.id}
      `;

      if (existingCommunity) {
        return NextResponse.json(
          { error: 'A community with this URL already exists' },
          { status: 400 }
        );
      }
    }

    // Update the community
    const updatedCommunity = await queryOne<UpdatedCommunity>`
      UPDATE communities
      SET
        name = ${updates.name},
        description = ${updates.description},
        image_url = ${updates.imageUrl},
        custom_links = ${JSON.stringify(Array.isArray(updates.customLinks) ? updates.customLinks : [])}::jsonb,
        slug = ${updates.slug},
        status = ${updates.status},
        opening_date = ${updates.opening_date},
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
