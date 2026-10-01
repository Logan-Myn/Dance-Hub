import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { requireSession } from '@/lib/community-auth';
import { validatePromoCode } from '@/lib/promo-codes/service';
import { createRateLimiter } from '@/lib/rate-limit';

// Slow down guessing codes: per user (across communities), and per community
// (across users, e.g. many throwaway accounts).
const WINDOW_MS = 10 * 60 * 1000;
const perUser = createRateLimiter({ limit: 10, windowMs: WINDOW_MS });
const perCommunity = createRateLimiter({ limit: 60, windowMs: WINDOW_MS });

const tooMany = () =>
  NextResponse.json(
    { valid: false, reason: 'Too many attempts. Please wait a few minutes and try again.' },
    { status: 429 },
  );

export async function POST(req: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await props.params;
  // Only someone signed in can be joining, so only they need to check a code.
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  if (!perUser.check(guard.session.user.id)) return tooMany();

  const community = await queryOne<{ id: string; stripe_account_id: string | null }>`
    SELECT id, stripe_account_id FROM communities WHERE slug = ${communitySlug}
  `;
  // Generic invalid result (never leak whether a community/code exists).
  const invalid = NextResponse.json({ valid: false, reason: 'That code is not valid.' });
  if (!community?.stripe_account_id) return invalid;
  if (!perCommunity.check(community.id)) return tooMany();

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
