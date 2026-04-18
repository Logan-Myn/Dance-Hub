import { queryOne } from '@/lib/db';
import { SubscriptionsEditor } from '@/components/admin/SubscriptionsEditor';

// Match the other admin pages (Emails/Dashboard/General): opt out of the data
// cache so the RSC re-renders with fresh `communities` row after any mutation
// + router.refresh(). Live Stripe status (chargesEnabled / requirements /
// payouts / bank account) is not cached server-side — it's fetched from
// Stripe inside the client island on mount.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

interface SubscriptionsRow {
  id: string;
  stripe_account_id: string | null;
  membership_enabled: boolean | null;
  membership_price: number | null;
}

export default async function SubscriptionsPage({
  params,
}: {
  params: { communitySlug: string };
}) {
  const community = await queryOne<SubscriptionsRow>`
    SELECT id, stripe_account_id, membership_enabled, membership_price
    FROM communities
    WHERE slug = ${params.communitySlug}
  `;
  if (!community) return null;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500">
      <header className="mb-10">
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">
          Subscriptions
        </h1>
      </header>

      <SubscriptionsEditor
        communityId={community.id}
        communitySlug={params.communitySlug}
        initialStripeAccountId={community.stripe_account_id}
        initialMembershipEnabled={community.membership_enabled ?? false}
        initialMembershipPrice={community.membership_price ?? 0}
      />
    </div>
  );
}
