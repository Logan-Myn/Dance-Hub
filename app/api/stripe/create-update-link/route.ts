import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { requireStripeAccountManager } from '@/lib/community-auth';

export async function POST(request: Request) {
  // Only accountId is read from the body. Any client-supplied returnUrl is
  // ignored so the hosted form can only send the owner back to our own
  // subscriptions admin page.
  const body = await request.json().catch(() => null);
  const accountId = typeof body?.accountId === 'string' ? body.accountId : '';

  const guard = await requireStripeAccountManager(accountId);
  if (!guard.ok) return guard.response;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const returnUrl = `${appUrl}/${encodeURIComponent(guard.community.slug)}/admin/subscriptions`;

  try {
    // Create an account link for collecting verification documents
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: returnUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
      collect: 'eventually_due'
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (error) {
    console.error('Error creating Stripe verification link:', error);
    return NextResponse.json(
      { error: 'Failed to create verification link' },
      { status: 500 }
    );
  }
}
