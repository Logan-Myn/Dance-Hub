import { queryOne } from '@/lib/db';
import { PromoCodesManager } from '@/components/admin/PromoCodesManager';

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
  const community = await queryOne<Row>`
    SELECT id, membership_enabled, membership_price, stripe_account_id, stripe_price_id, yearly_enabled
    FROM communities WHERE slug = ${communitySlug}
  `;
  if (!community) return null;

  const ready = Boolean(community.stripe_account_id && community.stripe_price_id && community.membership_enabled);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500">
      <header className="mb-10">
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">Promo Codes</h1>
        <p className="mt-2 text-muted-foreground">
          Create codes that give new members a discount when they join.
        </p>
      </header>

      {ready ? (
        <PromoCodesManager communitySlug={communitySlug} yearlyEnabled={Boolean(community.yearly_enabled)} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Set up payments and a membership price before creating promo codes.
        </p>
      )}
    </div>
  );
}
