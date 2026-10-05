import { requireCommunityManagerPage } from '@/lib/community-auth';
import { getCommunityBySlug } from '@/lib/community-data';
import { getOfferings } from '@/lib/offerings';
import { getOfferingFacts } from '@/lib/admin/offering-facts';
import OfferingsClient from './OfferingsClient';

export const dynamic = 'force-dynamic';

// The moment this request renders.
function requestTime(): number {
  return Date.now();
}

export default async function OfferingsPage(props: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await props.params;
  await requireCommunityManagerPage(communitySlug);
  const community = await getCommunityBySlug(communitySlug);
  if (!community) return null;
  const now = requestTime();
  const facts = await getOfferingFacts(community.id, new Date(now));
  return <OfferingsClient slug={communitySlug} initial={getOfferings(community)} facts={facts} />;
}
