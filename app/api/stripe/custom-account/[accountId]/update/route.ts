import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { sql } from '@/lib/db';

interface BusinessInfo {
  type: 'individual' | 'company';
  name?: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
  phone?: string;
  website?: string;
  mcc?: string;
  url?: string;
}

interface PersonalInfo {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  dob?: {
    day: number;
    month: number;
    year: number;
  };
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
  ssn_last_4?: string;
}

interface BankAccountInfo {
  account_number?: string;
  routing_number?: string;
  account_holder_name?: string;
  account_holder_type?: 'individual' | 'company';
  country?: string;
  currency?: string;
  iban?: string;
  skipped?: boolean;
}

export async function PUT(request: Request, props: { params: Promise<{ accountId: string }> }) {
  const params = await props.params;
  try {
    const { accountId } = params;
    const {
      step,
      businessInfo,
      personalInfo,
      bankAccount,
      tosAcceptance,
      currentStep
    } = await request.json() as {
      step: string;
      businessInfo?: BusinessInfo;
      personalInfo?: PersonalInfo;
      bankAccount?: BankAccountInfo;
      tosAcceptance?: { accepted: boolean; date: string; userAgent: string };
      currentStep?: number;
    };

    console.log('Update endpoint received:', { step, businessInfo, personalInfo, bankAccount, tosAcceptance, currentStep });

    // Verify the account exists and belongs to a community
    const account = await stripe.accounts.retrieve(accountId);

    if (!account) {
      return NextResponse.json(
        { error: 'Stripe account not found' },
        { status: 404 }
      );
    }

    const communityId = account.metadata?.community_id;
    if (!communityId) {
      return NextResponse.json(
        { error: 'Account not linked to community' },
        { status: 400 }
      );
    }

    let updateParams: any = {};

    // Handle different steps of the onboarding process
    switch (step) {
      case 'business_info':
        if (businessInfo) {
          updateParams = {
            business_type: businessInfo.type,
            ...(businessInfo.name && {
              [businessInfo.type === 'individual' ? 'individual' : 'company']: {
                ...(businessInfo.type === 'individual' ? { first_name: businessInfo.name.split(' ')[0], last_name: businessInfo.name.split(' ').slice(1).join(' ') } : { name: businessInfo.name })
              }
            }),
            business_profile: {
              ...(businessInfo.url && { url: businessInfo.url }),
              ...(businessInfo.mcc && { mcc: businessInfo.mcc }),
            },
            ...(businessInfo.address && {
              [businessInfo.type === 'individual' ? 'individual' : 'company']: {
                address: businessInfo.address
              }
            })
          };

          // Handle Terms of Service acceptance for Custom accounts
          if (tosAcceptance && tosAcceptance.accepted) {
            const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                           request.headers.get('x-real-ip') ||
                           request.headers.get('cf-connecting-ip') ||
                           '127.0.0.1';

            updateParams.tos_acceptance = {
              date: Math.floor(new Date(tosAcceptance.date).getTime() / 1000),
              ip: clientIP,
              user_agent: tosAcceptance.userAgent,
            };
          }
        }
        break;

      case 'personal_info':
        if (personalInfo) {
          updateParams = {
            individual: {
              ...(personalInfo.first_name && { first_name: personalInfo.first_name }),
              ...(personalInfo.last_name && { last_name: personalInfo.last_name }),
              ...(personalInfo.email && { email: personalInfo.email }),
              ...(personalInfo.phone && { phone: personalInfo.phone }),
              ...(personalInfo.dob && { dob: personalInfo.dob }),
              ...(personalInfo.address && { address: personalInfo.address }),
              ...(personalInfo.ssn_last_4 && { ssn_last_4: personalInfo.ssn_last_4 }),
            }
          };
        }
        break;

      case 'bank_account':
        if (bankAccount) {
          // Check if bank account was skipped (for international users)
          if (bankAccount.skipped) {
            console.log('Bank account setup was skipped for international user');
            // No action needed, just continue
            break;
          }

          try {
            // For US accounts using routing/account numbers
            if (bankAccount.routing_number && bankAccount.account_number) {
              // Create external account with routing/account numbers
              await stripe.accounts.createExternalAccount(accountId, {
                external_account: {
                  object: 'bank_account',
                  country: bankAccount.country || 'US',
                  currency: bankAccount.currency || 'usd',
                  account_holder_name: bankAccount.account_holder_name,
                  account_holder_type: bankAccount.account_holder_type || 'individual',
                  routing_number: bankAccount.routing_number,
                  account_number: bankAccount.account_number,
                }
              } as any);
            }
            // For international accounts using IBAN (according to Perplexity solution)
            else if (bankAccount.iban || (bankAccount.account_number && bankAccount.account_number.startsWith('EE'))) {
              const ibanValue = bankAccount.iban || bankAccount.account_number;

              // Create external account with IBAN as account_number (Perplexity solution)
              await stripe.accounts.createExternalAccount(accountId, {
                external_account: {
                  object: 'bank_account',
                  country: bankAccount.country, // Must be European country
                  currency: bankAccount.currency, // Must match IBAN country (eur for EE)
                  account_holder_name: bankAccount.account_holder_name,
                  account_holder_type: bankAccount.account_holder_type || 'individual',
                  account_number: ibanValue, // IBAN goes here, NOT in iban field
                  // NO routing_number for European accounts
                }
              } as any);
            }
            else {
              throw new Error('Invalid bank account information. Please provide either routing_number + account_number (US) or IBAN (international).');
            }
          } catch (stripeError: any) {
            console.error('Error creating external account:', stripeError);
            throw new Error(`Failed to create bank account: ${stripeError.message}`);
          }
        }
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid step provided' },
          { status: 400 }
        );
    }

    // Update the Stripe account if we have update parameters
    if (Object.keys(updateParams).length > 0) {
      try {
        await stripe.accounts.update(accountId, updateParams);
      } catch (stripeError: any) {
        console.error('Error updating Stripe account:', stripeError);
        return NextResponse.json(
          { error: 'Failed to update account: ' + stripeError.message },
          { status: 400 }
        );
      }
    }

    // Update onboarding progress in database (one jsonb column per branch).
    if (businessInfo) {
      await sql`
        UPDATE stripe_onboarding_progress
        SET
          updated_at = NOW(),
          current_step = COALESCE(${currentStep ?? null}, current_step),
          business_info = ${sql.json(businessInfo as any)}
        WHERE stripe_account_id = ${accountId}
      `;
    } else if (personalInfo) {
      await sql`
        UPDATE stripe_onboarding_progress
        SET
          updated_at = NOW(),
          current_step = COALESCE(${currentStep ?? null}, current_step),
          personal_info = ${sql.json(personalInfo as any)}
        WHERE stripe_account_id = ${accountId}
      `;
    } else if (bankAccount) {
      await sql`
        UPDATE stripe_onboarding_progress
        SET
          updated_at = NOW(),
          current_step = COALESCE(${currentStep ?? null}, current_step),
          bank_account = ${sql.json(bankAccount as any)}
        WHERE stripe_account_id = ${accountId}
      `;
    } else if (currentStep !== undefined) {
      await sql`
        UPDATE stripe_onboarding_progress
        SET
          updated_at = NOW(),
          current_step = ${currentStep}
        WHERE stripe_account_id = ${accountId}
      `;
    }

    // Get updated account status
    const updatedAccount = await stripe.accounts.retrieve(accountId);

    return NextResponse.json({
      success: true,
      accountId: accountId,
      step: step,
      requirements: {
        currentlyDue: updatedAccount.requirements?.currently_due || [],
        pastDue: updatedAccount.requirements?.past_due || [],
        eventuallyDue: updatedAccount.requirements?.eventually_due || [],
      },
      charges_enabled: updatedAccount.charges_enabled,
      payouts_enabled: updatedAccount.payouts_enabled,
      details_submitted: updatedAccount.details_submitted,
      message: `${step} updated successfully`
    });

  } catch (error: any) {
    console.error('Error updating custom Stripe account:', error);

    if (error.type === 'StripeError') {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode || 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update account information' },
      { status: 500 }
    );
  }
}
