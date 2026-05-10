import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { queryOne } from '@/lib/db';
import { getSession } from '@/lib/auth-session';

interface CommunityOwnership {
  id: string;
  created_by: string;
}

export async function POST(request: Request, props: { params: Promise<{ accountId: string }> }) {
  const params = await props.params;
  try {
    const { accountId } = params;
    const { iban, accountHolderName } = await request.json();

    // Verify authentication using Better Auth session
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user owns a community with this Stripe account
    const community = await queryOne<CommunityOwnership>`
      SELECT id, created_by
      FROM communities
      WHERE stripe_account_id = ${accountId}
        AND created_by = ${session.user.id}
    `;

    if (!community) {
      return NextResponse.json(
        { error: 'Account not found or unauthorized' },
        { status: 404 }
      );
    }

    // Validate input
    if (!iban || !accountHolderName) {
      return NextResponse.json(
        { error: 'IBAN and account holder name are required' },
        { status: 400 }
      );
    }

    // Get the connected account details
    const account = await stripe.accounts.retrieve(accountId);

    if (account.type !== 'custom') {
      return NextResponse.json(
        { error: 'Bank account updates are only supported for custom accounts' },
        { status: 400 }
      );
    }

    // Get current external accounts (bank accounts)
    const existingBankAccounts = await stripe.accounts.listExternalAccounts(
      accountId,
      { object: 'bank_account', limit: 10 }
    );

    const currentBankAccount = existingBankAccounts.data[0];
    const currency = currentBankAccount?.currency || account.default_currency || 'eur';
    const isCurrentlyDefault = currentBankAccount?.default_for_currency || false;

    // Create new bank account with updated IBAN
    const newBankAccount = await stripe.accounts.createExternalAccount(accountId, {
      external_account: {
        object: 'bank_account',
        country: account.country || 'FR', // Default to France for IBAN
        currency: currency,
        account_holder_name: accountHolderName,
        account_holder_type: 'individual',
        iban: iban,
      } as any, // Type assertion needed for IBAN field
    });

    // If the old bank account was default, make the new one default
    if (isCurrentlyDefault && newBankAccount.id) {
      await stripe.accounts.updateExternalAccount(
        accountId,
        newBankAccount.id,
        { default_for_currency: true }
      );
    }

    // Delete the old bank account if it exists
    if (currentBankAccount?.id) {
      try {
        await stripe.accounts.deleteExternalAccount(accountId, currentBankAccount.id);
      } catch (deleteError: any) {
        console.warn('Could not delete old bank account:', deleteError.message);
        // Don't fail the request if we can't delete the old account
        // The new account has been created successfully
      }
    }

    // Cast the response to BankAccount type for proper property access
    const bankAccountData = newBankAccount as any;

    return NextResponse.json({
      success: true,
      bankAccount: {
        id: bankAccountData.id,
        last4: bankAccountData.last4,
        country: bankAccountData.country,
        currency: bankAccountData.currency,
        account_holder_name: bankAccountData.account_holder_name,
        default_for_currency: bankAccountData.default_for_currency,
      },
      message: 'Bank account updated successfully'
    });

  } catch (error: any) {
    console.error('Error updating bank account IBAN:', error);

    if (error.type === 'StripeError') {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode || 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update bank account' },
      { status: 500 }
    );
  }
}
