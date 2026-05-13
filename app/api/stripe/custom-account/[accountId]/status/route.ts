import { NextResponse } from 'next/server';
import { stripe, mapStripeRequirement, isStripeAccountFullyVerified } from '@/lib/stripe';
import { queryOne } from '@/lib/db';

interface OnboardingProgress {
  current_step: number;
  completed_steps: number[];
  business_info: Record<string, unknown>;
  personal_info: Record<string, unknown>;
  bank_account: Record<string, unknown>;
  documents: unknown[];
  updated_at: string;
}

export async function GET(request: Request, props: { params: Promise<{ accountId: string }> }) {
  const params = await props.params;
  try {
    const { accountId } = params;

    // Get Stripe account information
    const account = await stripe.accounts.retrieve(accountId);

    if (!account) {
      return NextResponse.json(
        { error: 'Stripe account not found' },
        { status: 404 }
      );
    }

    // Get onboarding progress from database
    const progress = await queryOne<OnboardingProgress>`
      SELECT *
      FROM stripe_onboarding_progress
      WHERE stripe_account_id = ${accountId}
    `;

    const requirements = {
      currentlyDue: (account.requirements?.currently_due ?? []).map(mapStripeRequirement),
      pastDue: (account.requirements?.past_due ?? []).map(mapStripeRequirement),
      eventuallyDue: (account.requirements?.eventually_due ?? []).map(mapStripeRequirement),
      currentDeadline: account.requirements?.current_deadline,
      disabledReason: account.requirements?.disabled_reason,
    };

    const isFullyVerified = isStripeAccountFullyVerified(account);
    const needsAttention = requirements.currentlyDue.length > 0 || requirements.pastDue.length > 0;

    // Calculate completion percentage based on steps completed
    let completionPercentage = 0;
    const totalSteps = 5; // business_info, personal_info, bank_account, documents, verification

    if (progress) {
      // Check which steps are completed based on requirements
      let completedSteps = 0;

      // Step 1: Business info
      if (account.business_type && (account.business_type === 'individual' || account.company?.name)) {
        completedSteps++;
      }

      // Step 2: Personal info
      if (account.individual?.first_name && account.individual?.last_name) {
        completedSteps++;
      }

      // Step 3: Bank account
      if (account.external_accounts?.data && account.external_accounts.data.length > 0) {
        completedSteps++;
      }

      // Step 4: Documents (check if verification documents are uploaded)
      if ((progress.documents && progress.documents.length > 0) ||
          account.individual?.verification?.document?.front) {
        completedSteps++;
      }

      // Step 5: Verification complete
      if (isFullyVerified) {
        completedSteps++;
      }

      completionPercentage = Math.round((completedSteps / totalSteps) * 100);
    }

    // Determine current step based on what's missing
    let suggestedNextStep = 'business_info';
    if (account.business_type) {
      if (!account.individual?.first_name) {
        suggestedNextStep = 'personal_info';
      } else if (!account.external_accounts?.data?.length) {
        suggestedNextStep = 'bank_account';
      } else if (requirements.currentlyDue.some(req => req.code.includes('verification.document'))) {
        suggestedNextStep = 'documents';
      } else if (!isFullyVerified) {
        suggestedNextStep = 'verification';
      } else {
        suggestedNextStep = 'complete';
      }
    }

    const response = {
      accountId: account.id,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      business_type: account.business_type,
      country: account.country,
      default_currency: account.default_currency,
      email: account.email,

      // Onboarding status
      isFullyVerified,
      needsAttention,
      completionPercentage,
      suggestedNextStep,

      // Requirements
      requirements,

      // Progress tracking
      progress: progress ? {
        currentStep: progress.current_step,
        completedSteps: progress.completed_steps || [],
        businessInfo: progress.business_info || {},
        personalInfo: progress.personal_info || {},
        bankAccount: progress.bank_account || {},
        documents: progress.documents || [],
        updatedAt: progress.updated_at
      } : null,

      // Account capabilities
      capabilities: account.capabilities,

      // External accounts (bank accounts)
      bankAccounts: account.external_accounts?.data?.map(extAccount => {
        // Type guard to check if it's a bank account
        if (extAccount.object === 'bank_account') {
          const bankAccount = extAccount as any; // Cast to access bank account properties
          return {
            id: bankAccount.id,
            last4: bankAccount.last4,
            bank_name: bankAccount.bank_name,
            currency: bankAccount.currency,
            default_for_currency: bankAccount.default_for_currency
          };
        }
        return null;
      }).filter(Boolean) || []
    };

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('Error fetching custom Stripe account status:', error);

    if (error.type === 'StripeError') {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode || 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch account status' },
      { status: 500 }
    );
  }
}
