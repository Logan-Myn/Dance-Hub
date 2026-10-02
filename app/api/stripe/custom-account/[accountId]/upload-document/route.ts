import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { queryOne, sql } from '@/lib/db';
import { requireStripeAccountManager } from '@/lib/community-auth';
import { findRepresentative } from '@/lib/stripe-representative';

// Only verification uploads belong on this route; other file purposes
// (disputes, branding, etc.) must not be reachable from here.
const ALLOWED_PURPOSES = ['identity_document', 'additional_verification'] as const;
type AllowedPurpose = (typeof ALLOWED_PURPOSES)[number];

function isAllowedPurpose(value: string): value is AllowedPurpose {
  return (ALLOWED_PURPOSES as readonly string[]).includes(value);
}

const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/pdf'
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

// Identity documents and where they go in a `verification` hash. They belong
// to the individual on individual accounts and to the representative person
// on company accounts.
const IDENTITY_DOCUMENTS: Record<string, { field: 'document' | 'additional_document'; side: 'front' | 'back' }> = {
  identity_document: { field: 'document', side: 'front' },
  identity_document_back: { field: 'document', side: 'back' },
  additional_document: { field: 'additional_document', side: 'front' },
  additional_document_back: { field: 'additional_document', side: 'back' },
};

interface OnboardingProgress {
  stripe_account_id: string;
  documents: any[] | null;
}

export async function POST(request: Request, props: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await props.params;
  const guard = await requireStripeAccountManager(accountId);
  if (!guard.ok) return guard.response;

  try {
    const formData = await request.formData();

    const file = formData.get('file') as File;
    const documentType = formData.get('documentType') as string;
    const purpose = (formData.get('purpose') as string | null) || 'identity_document';

    if (!isAllowedPurpose(purpose)) {
      return NextResponse.json(
        { error: 'Invalid document purpose' },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!documentType) {
      return NextResponse.json(
        { error: 'Document type is required' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed types: JPEG, PNG, GIF, PDF' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size too large. Maximum size is 10MB' },
        { status: 400 }
      );
    }

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

    const identityDocument = Object.hasOwn(IDENTITY_DOCUMENTS, documentType)
      ? IDENTITY_DOCUMENTS[documentType]
      : undefined;
    if (!identityDocument && documentType !== 'company_document') {
      return NextResponse.json(
        { error: 'Invalid document type' },
        { status: 400 }
      );
    }

    // Company accounts verify their representative, who is created from the
    // personal information step.
    let representativeId: string | null = null;
    if (identityDocument && account.business_type === 'company') {
      const representative = await findRepresentative(accountId);
      if (!representative) {
        return NextResponse.json(
          { error: 'Please complete your personal information first' },
          { status: 400 }
        );
      }
      representativeId = representative.id;
    }

    // Convert file to buffer for Stripe upload
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload file to Stripe
    const stripeFile = await stripe.files.create({
      file: {
        data: buffer,
        name: file.name,
        type: file.type,
      },
      purpose,
    });

    // Attach the document to the person or company it verifies
    try {
      if (identityDocument) {
        const verification = {
          [identityDocument.field]: { [identityDocument.side]: stripeFile.id },
        };
        if (representativeId) {
          await stripe.accounts.updatePerson(accountId, representativeId, { verification });
        } else {
          await stripe.accounts.update(accountId, { individual: { verification } });
        }
      } else {
        await stripe.accounts.update(accountId, {
          company: { verification: { document: { front: stripeFile.id } } },
        });
      }
    } catch (stripeError: any) {
      console.error('Error updating account with document:', stripeError);
      return NextResponse.json(
        { error: 'Failed to attach document to account: ' + stripeError.message },
        { status: 400 }
      );
    }

    // Update document tracking in database
    const existingProgress = await queryOne<OnboardingProgress>`
      SELECT stripe_account_id, documents
      FROM stripe_onboarding_progress
      WHERE stripe_account_id = ${accountId}
    `;

    const currentDocuments = existingProgress?.documents || [];
    const newDocument = {
      id: stripeFile.id,
      type: documentType,
      purpose: purpose,
      filename: file.name,
      size: file.size,
      uploaded_at: new Date().toISOString()
    };

    const updatedDocuments = [...currentDocuments, newDocument];

    await sql`
      UPDATE stripe_onboarding_progress
      SET
        documents = ${sql.json(updatedDocuments)},
        updated_at = NOW()
      WHERE stripe_account_id = ${accountId}
    `;

    // Get updated account status to check requirements
    const updatedAccount = await stripe.accounts.retrieve(accountId);

    return NextResponse.json({
      success: true,
      file: {
        id: stripeFile.id,
        filename: file.name,
        size: file.size,
        type: documentType,
        uploadedAt: new Date().toISOString()
      },
      requirements: {
        currentlyDue: updatedAccount.requirements?.currently_due || [],
        pastDue: updatedAccount.requirements?.past_due || [],
        eventuallyDue: updatedAccount.requirements?.eventually_due || [],
      },
      charges_enabled: updatedAccount.charges_enabled,
      payouts_enabled: updatedAccount.payouts_enabled,
      details_submitted: updatedAccount.details_submitted,
      message: 'Document uploaded successfully'
    });

  } catch (error: any) {
    console.error('Error uploading document:', error);

    if (error.type === 'StripeError') {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode || 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to upload document' },
      { status: 500 }
    );
  }
}
