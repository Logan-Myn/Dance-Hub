import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

export async function GET(request: Request, props: { params: Promise<{ accountId: string }> }) {
  const params = await props.params;
  try {
    const { accountId } = params;
    console.log('Fetching Stripe account status for:', accountId);

    const account = await stripe.accounts.retrieve(accountId);
    console.log('Stripe account response:', {
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      requirements: account.requirements,
    });

    // Map requirements to more user-friendly messages
    const requirementMessages = {
      'individual.verification.document': 'Identity document required',
      'individual.verification.additional_document': 'Additional identity document required',
      'company.verification.document': 'Business verification document required',
      'company.license': 'Business license required',
      'company.tax_id': 'Business tax ID required',
      'company.address': 'Business address required',
      'individual.address': 'Personal address required',
      'individual.dob': 'Date of birth required',
      'individual.email': 'Email verification required',
      'individual.first_name': 'First name required',
      'individual.last_name': 'Last name required',
      'individual.phone': 'Phone number required',
      'individual.ssn_last_4': 'Last 4 digits of SSN required',
      'company.name': 'Company name required',
      'company.phone': 'Company phone required',
      'company.directors_provided': 'Company directors information required',
      'company.executives_provided': 'Company executives information required',
      'company.owners_provided': 'Company owners information required',
    };

    // Get detailed requirements information
    const requirements = {
      currentlyDue: account.requirements?.currently_due?.map(req => ({
        code: req,
        message: requirementMessages[req as keyof typeof requirementMessages] || req
      })) || [],
      pastDue: account.requirements?.past_due?.map(req => ({
        code: req,
        message: requirementMessages[req as keyof typeof requirementMessages] || req
      })) || [],
      eventuallyDue: account.requirements?.eventually_due?.map(req => ({
        code: req,
        message: requirementMessages[req as keyof typeof requirementMessages] || req
      })) || [],
      currentDeadline: account.requirements?.current_deadline,
      disabledReason: account.requirements?.disabled_reason,
    };

    // Check if the account is fully set up
    const isEnabled = account.charges_enabled && 
      account.payouts_enabled && 
      account.details_submitted && 
      !(account.requirements?.currently_due || []).length && 
      !(account.requirements?.past_due || []).length;

    const needsSetup = !account.details_submitted || 
      !account.charges_enabled || 
      !account.payouts_enabled || 
      (account.requirements?.currently_due || []).length > 0 || 
      (account.requirements?.past_due || []).length > 0;

    const response = {
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      requirements,
      businessType: account.business_type,
      capabilities: account.capabilities,
      payoutSchedule: account.settings?.payouts?.schedule,
      defaultCurrency: account.default_currency,
      email: account.email,
      isEnabled,
      needsSetup,
    };

    console.log('Sending response:', response);
    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error fetching Stripe account status:', error);
    // Check if it's a Stripe error
    if (error.type === 'StripeError') {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode || 500 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to fetch Stripe account status' },
      { status: 500 }
    );
  }
} 