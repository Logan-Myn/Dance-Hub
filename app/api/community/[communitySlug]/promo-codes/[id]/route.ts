import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';
import { setPromoCodeActive, deletePromoCode } from '@/lib/promo-codes/service';

interface OwnerCommunity { id: string; created_by: string; stripe_account_id: string | null; }

type OwnerResult =
  | { ok: true; row: OwnerCommunity }
  | { ok: false; response: NextResponse };

async function loadOwner(slug: string, userId: string): Promise<OwnerResult> {
  const row = await queryOne<OwnerCommunity>`
    SELECT id, created_by, stripe_account_id FROM communities WHERE slug = ${slug}
  `;
  if (!row) return { ok: false, response: NextResponse.json({ error: 'Community not found' }, { status: 404 }) };
  if (row.created_by !== userId) return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  if (!row.stripe_account_id) return { ok: false, response: NextResponse.json({ error: 'Payments not set up' }, { status: 400 }) };
  return { ok: true, row };
}

export async function PATCH(req: Request, props: { params: Promise<{ communitySlug: string; id: string }> }) {
  const { communitySlug, id } = await props.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await loadOwner(communitySlug, session.user.id);
  if (!result.ok) return result.response;
  try {
    const body = await req.json();
    await setPromoCodeActive({
      id, communityId: result.row.id, stripeAccountId: result.row.stripe_account_id!, active: Boolean(body.active),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update promo code';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, props: { params: Promise<{ communitySlug: string; id: string }> }) {
  const { communitySlug, id } = await props.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await loadOwner(communitySlug, session.user.id);
  if (!result.ok) return result.response;
  try {
    await deletePromoCode({ id, communityId: result.row.id, stripeAccountId: result.row.stripe_account_id! });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete promo code';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
