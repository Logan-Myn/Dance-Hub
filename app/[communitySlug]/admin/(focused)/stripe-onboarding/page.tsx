import { queryOne } from '@/lib/db';
import { StripeOnboardingClient } from '@/components/stripe-onboarding/StripeOnboardingClient';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

interface CommunityRow {
  id: string;
}

export default async function StripeOnboardingPage(
  props: { params: Promise<{ communitySlug: string }> }
) {
  const params = await props.params;
  const community = await queryOne<CommunityRow>`
    SELECT id FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return null;

  return (
    <StripeOnboardingClient
      communityId={community.id}
      communitySlug={params.communitySlug}
    />
  );
}
