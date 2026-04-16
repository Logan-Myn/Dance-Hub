import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { authorizeBroadcastAccess } from '@/lib/broadcasts/auth';
import { createBroadcastSubscriptionIntent } from '@/lib/broadcasts/billing';

export async function POST(
  _req: Request,
  { params }: { params: { communitySlug: string } }
) {
  const authz = await authorizeBroadcastAccess(params.communitySlug);
  if (!authz.ok) return authz.response;
  const { session, community } = authz;

  try {
    const { clientSecret, subscriptionId } = await createBroadcastSubscriptionIntent({
      communityId: community.id,
      ownerEmail: session.user.email,
    });
    return NextResponse.json({ clientSecret });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    console.error('[broadcasts:subscription:POST] failed', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { communitySlug: string } }
) {
  const authz = await authorizeBroadcastAccess(params.communitySlug);
  if (!authz.ok) return authz.response;
  const { community } = authz;

  const sub = await queryOne<{ stripe_subscription_id: string }>`
    SELECT stripe_subscription_id FROM community_broadcast_subscriptions
    WHERE community_id = ${community.id} AND status = 'active'
  `;
  if (!sub) return NextResponse.json({ error: 'No active subscription' }, { status: 404 });

  await stripe.subscriptions.update(sub.stripe_subscription_id, {
    cancel_at_period_end: true,
  });
  return NextResponse.json({ ok: true, cancelsAtPeriodEnd: true });
}
