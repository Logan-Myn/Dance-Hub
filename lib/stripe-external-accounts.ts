import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';

/**
 * Adds a bank account as the default for its currency and removes the
 * connected account's other bank accounts in that currency, so payouts in
 * it only go to the new one. Accounts in other currencies are left alone.
 *
 * Only the create step can fail the call, and if it does nothing has changed.
 * A failed removal is logged and reported back (removedOld: false), but by
 * then the new account is already the default, so payouts don't go to the
 * old one.
 */
export const OLD_BANK_NOT_REMOVED =
  "Your new bank account will receive payouts, but the previous bank account couldn't be removed. Email hello@dance-hub.io and we'll remove it.";

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
    const currency = (created.currency ?? bankAccount.currency ?? '').toLowerCase();
    for (const old of existing.data) {
      if (old.id === created.id) continue;
      if ((old.currency ?? '').toLowerCase() !== currency) continue;
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
