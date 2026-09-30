import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireCommunityManager } from '@/lib/community-auth';

export async function PUT(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    const guard = await requireCommunityManager(params.communitySlug);
    if (!guard.ok) return guard.response;

    const { categories } = await request.json();
    if (!Array.isArray(categories)) {
      return NextResponse.json(
        { error: 'Categories must be a list' },
        { status: 400 }
      );
    }

    // Update community categories
    const result = await sql`
      UPDATE communities
      SET
        thread_categories = ${sql.json(categories)},
        updated_at = NOW()
      WHERE id = ${guard.community.id}
      RETURNING id
    `;

    if (result.length === 0) {
      console.error('Error updating community: not found');
      return NextResponse.json(
        { error: 'Community not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, categories });
  } catch (error) {
    console.error('Error updating categories:', error);
    return NextResponse.json(
      { error: 'Failed to update categories' },
      { status: 500 }
    );
  }
}
