import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function PUT(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    const { categories } = await request.json();
    const { communitySlug } = params;

    // Update community categories
    const result = await sql`
      UPDATE communities
      SET
        thread_categories = ${sql.json(categories)},
        updated_at = NOW()
      WHERE slug = ${communitySlug}
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
