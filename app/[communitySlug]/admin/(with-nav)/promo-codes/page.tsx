import { requireCommunityManagerPage } from '@/lib/community-auth';
import { queryOne } from '@/lib/db';
import Link from 'next/link';
import { Tag } from 'lucide-react';
import { PromoCodesManager } from '@/components/admin/PromoCodesManager';
import { Screen, ScreenHead } from '@/components/community-admin/ui';
import { EmptyState } from '@/components/ds/empty-state';
import { BTN_PRIMARY } from '@/components/community-feed/feed-header';
import { communityPath } from '@/lib/safe-redirect';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

interface Row {
  id: string;
  membership_enabled: boolean | null;
  membership_price: number | null;
  stripe_account_id: string | null;
  stripe_price_id: string | null;
  yearly_enabled: boolean | null;
}

export default async function PromoCodesPage(props: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await props.params;
  await requireCommunityManagerPage(communitySlug);
  const community = await queryOne<Row>`
    SELECT id, membership_enabled, membership_price, stripe_account_id, stripe_price_id, yearly_enabled
    FROM communities WHERE slug = ${communitySlug}
  `;
  if (!community) return null;

  const ready = Boolean(community.stripe_account_id && community.stripe_price_id && community.membership_enabled);

  return (
    <Screen>
      <ScreenHead title="Promo codes" sub="Discounts on membership for new members. They enter the code when they join." />
      {ready ? (
        <PromoCodesManager communitySlug={communitySlug} yearlyEnabled={Boolean(community.yearly_enabled)} />
      ) : (
        <EmptyState
          icon={<Tag className="h-7 w-7" />}
          title="Set a membership price first"
          actions={
            <Link href={communityPath(communitySlug, '/admin/subscriptions')} className={BTN_PRIMARY}>
              Go to pricing and payouts
            </Link>
          }
        >
          Promo codes give a discount on a paid membership. Connect payouts and set a price, then come back here.
        </EmptyState>
      )}
    </Screen>
  );
}
