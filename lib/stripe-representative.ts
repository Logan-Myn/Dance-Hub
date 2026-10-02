import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';

// Company accounts are verified through a representative person (the owner
// filling in the form). `individual` fields are only valid on individual
// accounts, so personal details and ID documents for a company go here.

export async function findRepresentative(accountId: string): Promise<Stripe.Person | null> {
  const persons = await stripe.accounts.listPersons(accountId, {
    relationship: { representative: true },
    limit: 1,
  });
  return persons.data[0] ?? null;
}

/** Updates the account's representative, creating it on first use. */
export async function upsertRepresentative(
  accountId: string,
  details: Omit<Stripe.AccountCreatePersonParams, 'relationship'>
): Promise<Stripe.Person> {
  const params = { ...details, relationship: { representative: true } };
  const existing = await findRepresentative(accountId);
  if (existing) {
    return stripe.accounts.updatePerson(accountId, existing.id, params);
  }
  return stripe.accounts.createPerson(accountId, params);
}
