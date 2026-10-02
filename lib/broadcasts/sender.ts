import { Resend } from 'resend';
import { render } from '@react-email/components';
import React from 'react';
import type { BroadcastRecipient } from './recipients';
import {
  BATCH_SIZE,
  BATCH_DELAY_MS,
  MAX_BATCH_RETRIES,
  RETRY_BASE_DELAY_MS,
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
  communityId: string;
  subject: string;
  htmlContent: string;
  previewText?: string;
  recipients: BroadcastRecipient[];
  fromName: string;
  replyTo: string;
}

export interface FailedRecipient {
  userId: string;
  email: string;
  error: string;
}

export interface RunBroadcastResult {
  status: 'sent' | 'partial_failure' | 'failed';
  resendBatchIds: string[];
  errorMessage?: string;
  successfulCount: number;
  failedCount: number;
  /** Who didn't get it, so a resend can target only them. */
  failedRecipients: FailedRecipient[];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * `"Name" <address>` with the owner-controlled community name made safe for
 * a header: no line breaks or control characters, and no double quotes or
 * backslashes to break out of the quoted string (a comma or a quote in an
 * unquoted name could make every batch fail).
 */
export function formatFromHeader(name: string, address: string): string {
  const safe = name
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/"/g, "'")
    .replace(/\\/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return safe ? `"${safe}" <${address}>` : address;
}

/** A failed attempt, and whether trying the same batch again can help. */
class BatchSendError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs: number | null = null
  ) {
    super(message);
  }
}

function retryAfterMs(headers: Record<string, string> | null | undefined): number | null {
  const value = headers?.['retry-after'];
  const seconds = value ? Number(value) : NaN;
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1000, 10_000) : null;
}

function buildUnsubscribeUrl(token: string | null, communityId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://dance-hub.io';
  // Recipients arriving here without a token are pathological — getActiveRecipientsForCommunity
  // backfills email_preferences rows so every member has one. Point the fallback at the real
  // settings page (the old /settings/email-preferences route does not exist).
  if (!token) return `${base}/dashboard/settings`;
  const params = new URLSearchParams({
    token,
    type: 'teacher_broadcast',
    community_id: communityId,
  });
  return `${base}/api/email/unsubscribe?${params.toString()}`;
}

function personalize(html: string, recipient: BroadcastRecipient, communityId: string): string {
  return html
    .split(UNSUBSCRIBE_PLACEHOLDER)
    .join(buildUnsubscribeUrl(recipient.unsubscribeToken, communityId))
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
  replyTo: string,
  communityId: string,
  idempotencyKey: string
): Promise<{ batchId: string | null; error?: Error }> {
  const emails = batch.map((r) => ({
    from: formatFromHeader(fromName, BROADCAST_FROM_ADDRESS),
    to: r.email,
    replyTo,
    subject,
    html: personalize(templatedHtml, r, communityId),
    tags: [{ name: 'category', value: 'teacher_broadcast' }],
  }));

  let lastError: BatchSendError | undefined;
  for (let attempt = 0; attempt < MAX_BATCH_RETRIES; attempt++) {
    try {
      // Same key on every attempt: if an attempt reached Resend but its
      // answer was lost, the retry doesn't send the batch a second time.
      const result = await resend.batch.send(emails, { idempotencyKey });
      // Resend 6 reports failures in the result instead of throwing.
      if (result.error) {
        const { statusCode, message, name } = result.error;
        // concurrent_idempotent_requests (409): an earlier attempt with this
        // key is still being processed; asking again later gets its result.
        const retryable =
          statusCode === null ||
          statusCode === 429 ||
          statusCode >= 500 ||
          name === 'concurrent_idempotent_requests';
        throw new BatchSendError(message, retryable, retryAfterMs(result.headers));
      }
      return { batchId: result.data?.data?.[0]?.id ?? null };
    } catch (err) {
      // A thrown error is a network failure or similar: worth retrying.
      lastError =
        err instanceof BatchSendError ? err : new BatchSendError((err as Error)?.message ?? String(err), true);
      if (!lastError.retryable || attempt === MAX_BATCH_RETRIES - 1) break;
      await sleep(lastError.retryAfterMs ?? RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
    }
  }
  return { batchId: null, error: lastError };
}

export async function runBroadcast(input: RunBroadcastInput): Promise<RunBroadcastResult> {
  const { recipients, subject, htmlContent, fromName, replyTo, previewText, communityId } = input;

  const templatedHtml = await renderTemplate(fromName, subject, htmlContent, previewText);
  const chunks = chunk(recipients, BATCH_SIZE);

  const batchIds: string[] = [];
  const errors: Error[] = [];
  const failedRecipients: FailedRecipient[] = [];
  let successfulCount = 0;
  let failedCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const batch = chunks[i];
    const { batchId, error } = await sendBatchWithRetry(
      batch,
      subject,
      templatedHtml,
      fromName,
      replyTo,
      communityId,
      `broadcast-${input.broadcastId}-${i}`
    );
    if (!error) {
      if (batchId) batchIds.push(batchId);
      successfulCount += batch.length;
    } else {
      errors.push(error);
      failedCount += batch.length;
      for (const r of batch) {
        failedRecipients.push({ userId: r.userId, email: r.email, error: error.message });
      }
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
    errorMessage:
      errors.length > 0 ? [...new Set(errors.map((e) => e.message))].join('; ') : undefined,
    successfulCount,
    failedCount,
    failedRecipients,
  };
}
