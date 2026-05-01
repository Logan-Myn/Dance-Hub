import { Resend } from 'resend';
import { render } from '@react-email/components';
import React from 'react';
import type { BroadcastRecipient } from './recipients';
import {
  BATCH_SIZE,
  BATCH_DELAY_MS,
  MAX_BATCH_RETRIES,
  BROADCAST_FROM_ADDRESS,
} from './constants';
import { BroadcastEmail } from '@/lib/resend/templates/marketing/broadcast';

const resend = new Resend(process.env.RESEND_API_KEY);

// Internal-only placeholders — chosen so they cannot collide with text an owner
// could write in the editor. Replaced per-recipient just before sending.
const UNSUBSCRIBE_PLACEHOLDER = '__DH_BROADCAST_UNSUBSCRIBE_URL__';
const DISPLAY_NAME_PLACEHOLDER = '__DH_BROADCAST_DISPLAY_NAME__';

export interface RunBroadcastInput {
  broadcastId: string;
  subject: string;
  htmlContent: string;
  previewText?: string;
  recipients: BroadcastRecipient[];
  fromName: string;
  replyTo: string;
}

export interface RunBroadcastResult {
  status: 'sent' | 'partial_failure' | 'failed';
  resendBatchIds: string[];
  errorMessage?: string;
  successfulCount: number;
  failedCount: number;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildUnsubscribeUrl(token: string | null): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://dance-hub.io';
  // Recipients arriving here without a token are pathological — getActiveRecipientsForCommunity
  // backfills email_preferences rows so every member has one. Point the fallback at the real
  // settings page (the old /settings/email-preferences route does not exist).
  if (!token) return `${base}/dashboard/settings`;
  return `${base}/api/email/unsubscribe?token=${encodeURIComponent(token)}&type=teacher_broadcast`;
}

function personalize(html: string, recipient: BroadcastRecipient): string {
  return html
    .split(UNSUBSCRIBE_PLACEHOLDER)
    .join(buildUnsubscribeUrl(recipient.unsubscribeToken))
    .split(DISPLAY_NAME_PLACEHOLDER)
    .join(recipient.displayName);
}

/**
 * Render the full broadcast HTML once with placeholder tokens for per-recipient
 * substitution. Wraps the editor HTML in BaseLayout (which carries the
 * unsubscribe + preferences footer — required for CAN-SPAM / GDPR compliance).
 */
async function renderTemplate(
  communityName: string,
  subject: string,
  bodyHtml: string,
  previewText?: string
): Promise<string> {
  // Inject placeholder tokens into the footer unsubscribe links via the
  // existing BaseLayout footer. BroadcastEmail passes these through.
  return render(
    React.createElement(BroadcastEmail, {
      communityName,
      subject,
      bodyHtml,
      previewText,
      unsubscribePlaceholder: UNSUBSCRIBE_PLACEHOLDER,
    })
  );
}

async function sendBatchWithRetry(
  batch: BroadcastRecipient[],
  subject: string,
  templatedHtml: string,
  fromName: string,
  replyTo: string
): Promise<{ batchId: string | null; error?: Error }> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < MAX_BATCH_RETRIES; attempt++) {
    try {
      const emails = batch.map((r) => ({
        from: `${fromName} <${BROADCAST_FROM_ADDRESS}>`,
        to: r.email,
        replyTo,
        subject,
        html: personalize(templatedHtml, r),
        tags: [{ name: 'category', value: 'teacher_broadcast' }],
      }));
      const result = await resend.batch.send(emails);
      const firstId =
        (result as { data?: { data?: Array<{ id: string }> } })?.data?.data?.[0]?.id ?? null;
      return { batchId: firstId };
    } catch (err) {
      lastError = err as Error;
      if (attempt < MAX_BATCH_RETRIES - 1) {
        await sleep(BATCH_DELAY_MS * Math.pow(2, attempt));
      }
    }
  }
  return { batchId: null, error: lastError };
}

export async function runBroadcast(input: RunBroadcastInput): Promise<RunBroadcastResult> {
  const { recipients, subject, htmlContent, fromName, replyTo, previewText } = input;

  const templatedHtml = await renderTemplate(fromName, subject, htmlContent, previewText);
  const chunks = chunk(recipients, BATCH_SIZE);

  const batchIds: string[] = [];
  const errors: Error[] = [];
  let successfulCount = 0;
  let failedCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const batch = chunks[i];
    const { batchId, error } = await sendBatchWithRetry(
      batch,
      subject,
      templatedHtml,
      fromName,
      replyTo
    );
    if (batchId) {
      batchIds.push(batchId);
      successfulCount += batch.length;
    } else {
      if (error) errors.push(error);
      failedCount += batch.length;
    }
    if (i < chunks.length - 1) await sleep(BATCH_DELAY_MS);
  }

  let status: RunBroadcastResult['status'];
  if (failedCount === 0) status = 'sent';
  else if (successfulCount === 0) status = 'failed';
  else status = 'partial_failure';

  return {
    status,
    resendBatchIds: batchIds,
    errorMessage: errors.length > 0 ? errors.map((e) => e.message).join('; ') : undefined,
    successfulCount,
    failedCount,
  };
}
