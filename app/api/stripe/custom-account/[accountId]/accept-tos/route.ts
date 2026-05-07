import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

export async function POST(request: Request, props: { params: Promise<{ accountId: string }> }) {
  const params = await props.params;
  try {
    const { accountId } = params;
    const { acceptedAt, userAgent, ip } = await request.json();

    // Get the client IP from headers if not provided
    const clientIP = ip || 
      request.headers.get('x-forwarded-for')?.split(',')[0] || 
      request.headers.get('x-real-ip') || 
      '127.0.0.1';

    // Update the Stripe account with Terms of Service acceptance
    await stripe.accounts.update(accountId, {
      tos_acceptance: {
        date: Math.floor(new Date(acceptedAt).getTime() / 1000),
        ip: clientIP,
        user_agent: userAgent,
      },
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Terms of Service accepted successfully' 
    });

  } catch (error: any) {
    console.error('Error accepting Terms of Service:', error);
    
    if (error.type === 'StripeError') {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode || 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to accept Terms of Service' },
      { status: 500 }
    );
  }
} 