import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';
import { createPromoCode, listPromoCodes } from '@/lib/promo-codes/service';
import type { CreatePromoCodeInput } from '@/lib/promo-codes/types';

interface OwnerCommunity {
  id: string;
  created_by: string;
  stripe_account_id: string | null;
  stripe_price_id: string | null;
}

type OwnerResult =
  | { ok: true; row: OwnerCommunity }
  | { ok: false; response: NextResponse };

async function loadOwner(slug: string, userId: string): Promise<OwnerResult> {
  const row = await queryOne<OwnerCommunity>`
    SELECT id, created_by, stripe_account_id, stripe_price_id
    FROM communities WHERE slug = ${slug}
  `;
  if (!row) return { ok: false, response: NextResponse.json({ error: 'Community not found' }, { status: 404 }) };
  if (row.created_by !== userId) return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  if (!row.stripe_account_id) return { ok: false, response: NextResponse.json({ error: 'Payments not set up' }, { status: 400 }) };
  return { ok: true, row };
}

export async function GET(_req: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await props.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await loadOwner(communitySlug, session.user.id);
  if (!result.ok) return result.response;
  try {
    const codes = await listPromoCodes({ communityId: result.row.id, stripeAccountId: result.row.stripe_account_id! });
    return NextResponse.json({ codes });
  } catch (err) {
    console.error('[promo-codes] list failed', err);
    return NextResponse.json({ error: 'Failed to load promo codes' }, { status: 500 });
  }
}

export async function POST(req: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await props.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await loadOwner(communitySlug, session.user.id);
  if (!result.ok) return result.response;
  if (!result.row.stripe_price_id) {
    return NextResponse.json({ error: 'Set a membership price before creating promo codes' }, { status: 400 });
  }
  try {
    const input = (await req.json()) as CreatePromoCodeInput;
    const code = await createPromoCode({
      communityId: result.row.id,
      stripeAccountId: result.row.stripe_account_id!,
      stripePriceId: result.row.stripe_price_id,
      createdBy: session.user.id,
      input,
    });
    return NextResponse.json({ code });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create promo code';
    console.error('[promo-codes] create failed', err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
