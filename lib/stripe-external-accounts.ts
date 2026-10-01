import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';

/**
 * Adds a bank account as the default for its currency and removes the
 * connected account's other bank accounts, so payouts only go to the new one.
 *
 * Only the create step can fail the call, and if it does nothing has changed.
 * A failed removal is logged and reported back, but by then the new account
 * is already the default, so payouts don't go to the old one.
 */
export async function replaceBankAccount(
  accountId: string,
  bankAccount: Stripe.AccountCreateExternalAccountParams.BankAccount
): Promise<{ bankAccount: Stripe.BankAccount; removedOld: boolean }> {
  const created = (await stripe.accounts.createExternalAccount(accountId, {
    external_account: bankAccount,
    default_for_currency: true,
  })) as Stripe.BankAccount;

  let removedOld = true;
  try {
    const existing = await stripe.accounts.listExternalAccounts(accountId, {
      object: 'bank_account',
      limit: 100,
    });
    for (const old of existing.data) {
      if (old.id === created.id) continue;
      try {
        await stripe.accounts.deleteExternalAccount(accountId, old.id);
      } catch (error) {
        removedOld = false;
        console.warn('Could not delete old bank account', old.id, error);
      }
    }
  } catch (error) {
    removedOld = false;
    console.warn('Could not list bank accounts after adding a new one', error);
  }

  return { bankAccount: created, removedOld };
}
