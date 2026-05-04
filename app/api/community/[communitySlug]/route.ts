import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

// Force dynamic - no caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface CommunityWithMembersCount {
  id: string;
  created_at: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  image_focal_x: number | null;
  image_focal_y: number | null;
  image_zoom: string | number | null;
  created_by: string;
  price: number | null;
  currency: string | null;
  membership_enabled: boolean;
  membership_price: number | null;
  stripe_account_id: string | null;
  stripe_price_id: string | null;
  stripe_onboarding_type: string | null;
  thread_categories: unknown;
  custom_links: unknown;
  members_count: number;
  status: string;
  opening_date: string | null;
  can_change_opening_date: boolean;
}

export async function GET(
  request: Request,
  { params }: { params: { communitySlug: string } }
) {
  try {
    const { communitySlug } = params;

    // Get community by slug with members count
    const community = await queryOne<CommunityWithMembersCount>`
      SELECT
        c.id,
        c.created_at,
        c.name,
        c.slug,
        c.description,
        c.image_url,
        c.image_focal_x,
        c.image_focal_y,
        c.image_zoom,
        c.created_by,
        c.price,
        c.currency,
        c.membership_enabled,
        c.membership_price,
        c.stripe_account_id,
        c.stripe_price_id,
        c.stripe_onboarding_type,
        c.thread_categories,
        c.custom_links,
        c.status,
        c.opening_date,
        c.can_change_opening_date,
        (SELECT COUNT(*) FROM community_members cm WHERE cm.community_id = c.id AND cm.role != 'admin')::int as members_count
      FROM communities c
      WHERE c.slug = ${communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: 'Community not found' },
        { status: 404 }
      );
    }

    const communityData = {
      ...community,
      membersCount: community.members_count,
      imageUrl: community.image_url,
      imageFocalX: community.image_focal_x ?? 50,
      imageFocalY: community.image_focal_y ?? 50,
      imageZoom: Number(community.image_zoom ?? 1),
      community_members: [{ count: community.members_count }],
    };

    const response = NextResponse.json(communityData);
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return response;
  } catch (error) {
    console.error('Error fetching community:', error);
    return NextResponse.json(
      { error: 'Failed to fetch community' },
      { status: 500 }
    );
  }
}
