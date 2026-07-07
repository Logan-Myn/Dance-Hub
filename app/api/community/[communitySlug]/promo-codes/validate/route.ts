import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { validatePromoCode } from '@/lib/promo-codes/service';

export async function POST(req: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await props.params;
  const community = await queryOne<{ id: string; stripe_account_id: string | null }>`
    SELECT id, stripe_account_id FROM communities WHERE slug = ${communitySlug}
  `;
  // Generic invalid result (never leak whether a community/code exists).
  const invalid = NextResponse.json({ valid: false, reason: 'That code is not valid.' });
  if (!community?.stripe_account_id) return invalid;

  try {
    const body = await req.json();
    const code = typeof body?.code === 'string' ? body.code : '';
    if (!code.trim()) return invalid;
    const plan = body?.plan === 'yearly' ? 'yearly' : 'monthly';
    const result = await validatePromoCode({
      stripeAccountId: community.stripe_account_id,
      code,
      communityId: community.id,
      plan,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[promo-codes] validate failed', err);
    return invalid;
  }
}
