import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { createBroadcastCheckoutSession } from '@/lib/broadcasts/billing';

export async function POST(
  _req: Request,
  { params }: { params: { communitySlug: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const community = await queryOne<{ id: string; slug: string; created_by: string }>`
    SELECT id, slug, created_by FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (community.created_by !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { checkoutUrl } = await createBroadcastCheckoutSession({
    communityId: community.id,
    communitySlug: community.slug,
    ownerEmail: session.user.email,
    returnUrl: '',
  });
  return NextResponse.json({ checkoutUrl });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { communitySlug: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const community = await queryOne<{ id: string; created_by: string }>`
    SELECT id, created_by FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (community.created_by !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sub = await queryOne<{ stripe_subscription_id: string }>`
    SELECT stripe_subscription_id FROM community_broadcast_subscriptions
    WHERE community_id = ${community.id} AND status = 'active'
  `;
  if (!sub) return NextResponse.json({ error: 'No active subscription' }, { status: 404 });

  await stripe.subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: true });
  return NextResponse.json({ ok: true, cancelsAtPeriodEnd: true });
}
