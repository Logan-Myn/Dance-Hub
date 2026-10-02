import { sql } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { cancelSubscriptionNow } from '@/lib/subscription-cancel';

// Defined with the other community-status rules (a module without Stripe).
export { PRE_REGISTERED_STATUSES } from '@/lib/community-status';

export interface PreRegistrationRow {
  stripe_subscription_id: string | null;
  stripe_invoice_id: string | null;
  pre_registration_payment_method_id: string | null;
  stripe_customer_id: string | null;
}

/**
 * Undoes a pre-registration: cancels the subscription that would charge on
 * the opening date, cleans up the saved card and customer, and removes the
 * member row. Throws, keeping the row, if that subscription could not be
 * cancelled (otherwise the user would be charged with no way to stop it).
 */
export async function cancelPreRegistration(args: {
  communityId: string;
  userId: string;
  stripeAccountId: string | null;
  member: PreRegistrationRow;
}): Promise<void> {
  const { communityId, userId, member } = args;
  const stripeAccount = args.stripeAccountId!;

  if (member.stripe_subscription_id) {
    if (!args.stripeAccountId) {
      throw new Error('No connected account to cancel the pre-registration subscription on');
    }
    await cancelSubscriptionNow(member.stripe_subscription_id, args.stripeAccountId);
  }

  // Cancel the scheduled invoice if it exists
  if (member.stripe_invoice_id) {
    try {
      await stripe.invoices.voidInvoice(
        member.stripe_invoice_id,
        {
          stripeAccount,
        }
      );
    } catch (stripeError) {
      // If invoice is already voided or doesn't exist, that's fine
      const code = (stripeError as { code?: string }).code;
      if (code !== 'invoice_not_found' && code !== 'resource_already_exists') {
        console.error("Error voiding invoice:", stripeError);
      }
    }
  }

  // Delete the payment method from Stripe if it exists
  if (member.pre_registration_payment_method_id) {
    try {
      await stripe.paymentMethods.detach(
        member.pre_registration_payment_method_id,
        {
          stripeAccount,
        }
      );
    } catch (stripeError) {
      // If payment method doesn't exist or is already detached, that's fine
      console.error("Error detaching payment method:", stripeError);
    }
  }

  // Delete the customer from Stripe if it exists
  if (member.stripe_customer_id) {
    try {
      await stripe.customers.del(
        member.stripe_customer_id,
        {
          stripeAccount,
        }
      );
    } catch (stripeError) {
      // If customer doesn't exist, that's fine
      console.error("Error deleting customer:", stripeError);
    }
  }

  // Remove member record from database
  await sql`
    DELETE FROM community_members
    WHERE community_id = ${communityId}
      AND user_id = ${userId}
  `;
}
