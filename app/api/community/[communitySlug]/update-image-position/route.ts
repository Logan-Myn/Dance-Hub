import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { sql } from '@/lib/db';

export async function PUT(
  request: Request,
  { params }: { params: { communitySlug: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { communitySlug } = params;
    const { focalX, focalY, zoom } = await request.json();

    const fx = Number(focalX);
    const fy = Number(focalY);
    const z = Number(zoom);

    if (!Number.isFinite(fx) || fx < 0 || fx > 100) {
      return NextResponse.json({ error: 'focalX must be a number between 0 and 100' }, { status: 400 });
    }
    if (!Number.isFinite(fy) || fy < 0 || fy > 100) {
      return NextResponse.json({ error: 'focalY must be a number between 0 and 100' }, { status: 400 });
    }
    if (!Number.isFinite(z) || z < 1 || z > 5) {
      return NextResponse.json({ error: 'zoom must be a number between 1 and 5' }, { status: 400 });
    }

    const communities = await sql`
      SELECT id, created_by FROM communities WHERE slug = ${communitySlug}
    `;
    if (communities.length === 0) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 });
    }
    if (communities[0].created_by !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await sql`
      UPDATE communities
      SET
        image_focal_x = ${Math.round(fx)},
        image_focal_y = ${Math.round(fy)},
        image_zoom = ${z.toFixed(2)},
        updated_at = NOW()
      WHERE id = ${communities[0].id}
    `;

    return NextResponse.json({
      success: true,
      focalX: Math.round(fx),
      focalY: Math.round(fy),
      zoom: Number(z.toFixed(2)),
    });
  } catch (error) {
    console.error('Error updating image position:', error);
    return NextResponse.json(
      { error: 'Failed to update image position' },
      { status: 500 }
    );
  }
}
