import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { queryOne } from '@/lib/db';
import { getSession } from '@/lib/auth-session';
import {
  buildPayoutBankAccount,
  countryName,
  getPayoutBankFormat,
  PAYOUT_SUPPORT_EMAIL,
} from '@/lib/payout-bank-formats';
import { OLD_BANK_NOT_REMOVED, replaceBankAccount } from '@/lib/stripe-external-accounts';

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

    // The currency is the account's default currency (or its country's:
    // SEK in Sweden, CHF in Switzerland, EUR in the euro area), not whatever
    // the old account used.
    const format = getPayoutBankFormat(account.country);
    const acceptsIban =
      format.kind === 'iban' || (format.kind === 'local' && format.ibanAlternative);
    if (!acceptsIban) {
      return NextResponse.json(
        {
          error: `Banks in your country don't use an IBAN. Email ${PAYOUT_SUPPORT_EMAIL} and we'll help you change your payout bank.`,
        },
        { status: 400 }
      );
    }

    const built = buildPayoutBankAccount(account.country, { iban }, true, {
      currency: account.default_currency,
    });
    if (!built.ok) {
      return NextResponse.json(
        { error: built.errors.iban ?? built.errors.form ?? 'Invalid IBAN' },
        { status: 400 }
      );
    }

    // Stripe takes an IBAN as the account_number; there is no `iban` field.
    // The new account becomes the default and the old ones are removed.
    let replaced;
    try {
      replaced = await replaceBankAccount(accountId, {
        object: 'bank_account',
        country: built.country,
        currency: built.currency,
        account_holder_name: accountHolderName,
        account_holder_type: account.business_type === 'company' ? 'company' : 'individual',
        account_number: built.accountNumber,
      });
    } catch (stripeError: any) {
      // Most euro accounts may use a euro bank in another country, but not
      // all; say what to do instead of passing the raw error on.
      if (built.country !== account.country && stripeError?.type === 'StripeInvalidRequestError') {
        return NextResponse.json(
          {
            error: `Payouts to a bank account in ${countryName(built.country)} aren't available for this account. Use a bank account in ${countryName(account.country)}.`,
          },
          { status: 400 }
        );
      }
      throw stripeError;
    }
    const { bankAccount: newBankAccount, removedOld } = replaced;

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
      message: removedOld ? 'Bank account updated successfully' : OLD_BANK_NOT_REMOVED
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
