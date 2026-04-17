import { notFound } from 'next/navigation';
import type { Section } from '@/types/page-builder';
import { getSession } from '@/lib/auth-session';
import {
  getCommunityBySlug,
  getCommunityMembership,
} from '@/lib/community-data';
import AboutClient from './AboutClient';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function AboutPage({
  params,
}: {
  params: { communitySlug: string };
}) {
  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) notFound();

  // Public page — anonymous viewers are fine. We just resolve member /
  // creator state when there's a session so the editor / member-only UI
  // shows correctly.
  const session = await getSession();
  const isCreator = !!session && community.created_by === session.user.id;
  const isMember = !!session && (await getCommunityMembership(community.id, session.user.id));

  // Coerce DB shape to what AboutClient expects.
  const initialCommunity = {
    id: community.id,
    name: community.name,
    slug: community.slug,
    description: community.description ?? '',
    created_by: community.created_by,
    membership_enabled: community.membership_enabled ?? undefined,
    membership_price:
      typeof community.membership_price === 'string'
        ? parseFloat(community.membership_price)
        : community.membership_price ?? undefined,
    stripe_account_id: community.stripe_account_id ?? null,
    status: (community.status ?? undefined) as 'active' | 'pre_registration' | 'inactive' | undefined,
    opening_date:
      community.opening_date instanceof Date
        ? community.opening_date.toISOString()
        : community.opening_date ?? null,
    about_page: community.about_page
      ? {
          sections: (community.about_page.sections ?? []) as Section[],
          meta: {
            last_updated: community.about_page.meta?.last_updated ?? new Date().toISOString(),
            published_version: community.about_page.meta?.published_version,
          },
        }
      : null,
  };

  return (
    <AboutClient
      communitySlug={params.communitySlug}
      community={initialCommunity}
      isCreator={isCreator}
      isMember={isMember}
    />
  );
}
