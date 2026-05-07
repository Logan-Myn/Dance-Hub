import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import Stripe from 'stripe';

// GET endpoint to fetch bank account details
export async function GET(request: Request, props: { params: Promise<{ accountId: string }> }) {
  const params = await props.params;
  try {
    const { accountId } = params;
    
    // Retrieve the external account (bank account) information
    const account = await stripe.accounts.retrieve(accountId);
    const bankAccounts = await stripe.accounts.listExternalAccounts(
      accountId,
      { object: 'bank_account', limit: 1 }
    );

    const bankAccount = bankAccounts.data[0] as Stripe.BankAccount;

    if (!bankAccount) {
      return NextResponse.json({ error: 'No bank account found' }, { status: 404 });
    }

    return NextResponse.json({
      last4: bankAccount.last4,
      country: bankAccount.country,
      currency: bankAccount.currency,
      account_holder_name: bankAccount.account_holder_name,
    });
  } catch (error) {
    console.error('Error fetching bank account:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bank account details' },
      { status: 500 }
    );
  }
}

// PUT endpoint to create a login link for bank account management
export async function PUT(request: Request, props: { params: Promise<{ accountId: string }> }) {
  const params = await props.params;
  try {
    const { accountId } = params;

    // First, check the account status and type
    const account = await stripe.accounts.retrieve(accountId);
    
    // Check if the account has completed onboarding
    if (!account.details_submitted || !account.charges_enabled) {
      // If the account isn't fully set up, redirect to complete onboarding first
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/community/settings?setup=incomplete`,
        return_url: `${process.env.NEXT_PUBLIC_APP_URL}/community/settings?setup=complete`,
        type: 'account_onboarding',
      });

      return NextResponse.json({
        success: true,
        url: accountLink.url,
        requiresOnboarding: true,
        accountType: account.type
      });
    }

    // Handle different account types
    if (account.type === 'custom') {
      // For Custom accounts, redirect to the main Stripe Dashboard
      // Custom accounts don't have Express Dashboard access
      return NextResponse.json({
        success: true,
        url: `https://dashboard.stripe.com/${accountId}/balance/overview`,
        requiresOnboarding: false,
        accountType: 'custom',
        message: 'Redirecting to Stripe Dashboard to manage bank account'
      });
    } else {
      // For Express accounts, create a login link to the Express Dashboard
      const loginLink = await stripe.accounts.createLoginLink(accountId);

      return NextResponse.json({
        success: true,
        url: loginLink.url,
        requiresOnboarding: false,
        accountType: account.type
      });
    }
    
  } catch (error: any) {
    console.error('Error creating login link:', error);
    
    // If this specific error occurs, handle based on account type
    if (error.message?.includes('does not have access to the Express Dashboard')) {
      try {
        // Retrieve account to check its type
        const account = await stripe.accounts.retrieve(params.accountId);
        
        if (account.type === 'custom') {
          // For Custom accounts, redirect to main Stripe Dashboard
          return NextResponse.json({
            success: true,
            url: `https://dashboard.stripe.com/${params.accountId}/balance/overview`,
            requiresOnboarding: false,
            accountType: 'custom',
            message: 'Redirecting to Stripe Dashboard to manage bank account'
          });
        } else {
          // For Express accounts that need more setup
          const accountLink = await stripe.accountLinks.create({
            account: params.accountId,
            refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/community/settings?setup=incomplete`,
            return_url: `${process.env.NEXT_PUBLIC_APP_URL}/community/settings?setup=complete`,
            type: 'account_onboarding',
          });

          return NextResponse.json({
            success: true,
            url: accountLink.url,
            requiresOnboarding: true,
            accountType: account.type
          });
        }
      } catch (fallbackError) {
        console.error('Fallback error:', fallbackError);
      }
    }
    
    return NextResponse.json(
      { 
        error: error.message || 'Failed to create login link',
        code: error.code
      },
      { status: error.statusCode || 400 }
    );
  }
} 