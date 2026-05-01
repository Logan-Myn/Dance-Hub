import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { sql } from '@/lib/db';

export async function PUT(
  request: Request,
  { params }: { params: { communitySlug: string } }
) {
  try {
    // Verify authentication
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { communitySlug } = params;
    const { imageUrl } = await request.json();

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      );
    }

    // Get the community and verify ownership
    const communities = await sql`
      SELECT id, created_by FROM communities WHERE slug = ${communitySlug}
    `;

    if (communities.length === 0) {
      return NextResponse.json(
        { error: 'Community not found' },
        { status: 404 }
      );
    }

    const community = communities[0];

    // Check if user is the community owner
    if (community.created_by !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden: Only the community owner can update the image' },
        { status: 403 }
      );
    }

    // Update the community image and reset focal/zoom — the old positioning
    // is meaningless once the image itself changes.
    await sql`
      UPDATE communities
      SET
        image_url = ${imageUrl},
        image_focal_x = 50,
        image_focal_y = 50,
        image_zoom = 1.00,
        updated_at = NOW()
      WHERE id = ${community.id}
    `;

    return NextResponse.json({
      success: true,
      imageUrl
    });
  } catch (error) {
    console.error('Error updating community image:', error);
    return NextResponse.json(
      { error: 'Failed to update community image' },
      { status: 500 }
    );
  }
}
