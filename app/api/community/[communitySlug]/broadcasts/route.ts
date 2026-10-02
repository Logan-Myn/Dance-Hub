import { NextResponse, after } from 'next/server';
import { queryOne, query, sql } from '@/lib/db';
import { authorizeBroadcastAccess } from '@/lib/broadcasts/auth';
import { checkCanSend } from '@/lib/broadcasts/quota';
import { getActiveRecipientsForCommunity } from '@/lib/broadcasts/recipients';
import { runBroadcast, type RunBroadcastInput } from '@/lib/broadcasts/sender';
import { sanitizeEmailHtml } from '@/lib/sanitize-html';

interface BroadcastListRow {
  id: string;
  subject: string;
  recipient_count: number;
  status: string;
  sent_at: string | null;
  created_at: string;
}

export async function POST(req: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  const authz = await authorizeBroadcastAccess(params.communitySlug);
  if (!authz.ok) return authz.response;
  const { session, community } = authz;

  let broadcastId: string | null = null;

  try {
    const { subject, htmlContent: rawHtml, editorJson, previewText } = (await req.json()) as {
      subject: string;
      htmlContent: unknown;
      editorJson: unknown;
      previewText?: string;
    };
    // Stored, sent and shown on the archive page: keep only the editor's markup.
    const htmlContent = sanitizeEmailHtml(rawHtml);
    if (!subject || !htmlContent || !editorJson) {
      return NextResponse.json(
        { error: 'Missing subject/htmlContent/editorJson' },
        { status: 400 }
      );
    }

    const gate = await checkCanSend(community.id);
    if (!gate.allowed) {
      const httpStatus = gate.reason === 'soft_cap_reached' ? 429 : 402;
      return NextResponse.json(
        { error: gate.reason, quota: gate.quota },
        { status: httpStatus }
      );
    }

    // email_broadcasts.sender_user_id is uuid REFERENCES profiles(id); session.user.id
    // is the better-auth text ID, so resolve it to the profile UUID.
    const senderProfile = await queryOne<{ id: string }>`
      SELECT id FROM profiles WHERE auth_user_id = ${session.user.id}
    `;
    if (!senderProfile) {
      return NextResponse.json({ error: 'Sender profile not found' }, { status: 500 });
    }

    const inserted = await queryOne<{ id: string }>`
      INSERT INTO email_broadcasts
        (community_id, sender_user_id, subject, html_content, editor_json, preview_text,
         recipient_count, status)
      VALUES
        (${community.id}, ${senderProfile.id}, ${subject}, ${htmlContent},
         ${sql.json(editorJson as any)}, ${previewText ?? null}, 0, 'sending')
      RETURNING id
    `;
    if (!inserted) {
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
    }
    broadcastId = inserted.id;

    const recipients = await getActiveRecipientsForCommunity(community.id);
    if (recipients.length === 0) {
      await sql`
        UPDATE email_broadcasts
        SET status = 'failed', error_message = 'no_recipients'
        WHERE id = ${broadcastId}
      `;
      return NextResponse.json({ error: 'no_recipients' }, { status: 422 });
    }

    await sql`
      UPDATE email_broadcasts
      SET recipient_count = ${recipients.length}
      WHERE id = ${broadcastId}
    `;

    // Send after the response. With rate-limit retries a large broadcast can
    // take longer than the proxy lets a request live; the owner then saw an
    // error while the send went on, and publishing again sent it twice. The
    // composer polls the status route until the row leaves 'sending'.
    const sendInput: RunBroadcastInput = {
      broadcastId,
      communityId: community.id,
      subject,
      htmlContent,
      previewText,
      recipients,
      fromName: community.name,
      replyTo: 'hello@dance-hub.io',
    };
    after(() => sendAndRecord(sendInput));

    return NextResponse.json({
      broadcastId,
      recipientCount: recipients.length,
      status: 'sending',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    console.error('[broadcasts:POST] failed', err);

    // Best-effort: mark a stuck `sending` row as failed so it doesn't
    // permanently consume the owner's monthly quota.
    if (broadcastId) {
      try {
        await sql`
          UPDATE email_broadcasts
          SET status = 'failed', error_message = ${msg}
          WHERE id = ${broadcastId} AND status = 'sending'
        `;
      } catch (cleanupErr) {
        console.error('[broadcasts:POST] cleanup failed', cleanupErr);
      }
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Runs the send and writes its outcome on the broadcast row. Never throws. */
async function sendAndRecord(input: RunBroadcastInput): Promise<void> {
  const { broadcastId } = input;
  let result: Awaited<ReturnType<typeof runBroadcast>>;
  try {
    result = await runBroadcast(input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    console.error('[broadcasts:send] failed', err);
    // Don't leave the row 'sending': it would count against the monthly
    // quota and keep the composer waiting.
    try {
      await sql`
        UPDATE email_broadcasts
        SET status = 'failed', error_message = ${msg}
        WHERE id = ${broadcastId} AND status = 'sending'
      `;
    } catch (cleanupErr) {
      console.error('[broadcasts:send] cleanup failed', cleanupErr);
    }
    return;
  }

  try {
    await sql`
      UPDATE email_broadcasts
      SET status = ${result.status},
          resend_batch_ids = ${result.resendBatchIds},
          error_message = ${result.errorMessage ?? null},
          sent_at = ${
            result.status === 'sent' || result.status === 'partial_failure'
              ? new Date()
              : null
          }
      WHERE id = ${broadcastId}
    `;
  } catch (recordErr) {
    console.error('[broadcasts:send] could not record the outcome', broadcastId, recordErr);
    return;
  }

  // Who didn't get it, so a resend can target only them. Separate and best
  // effort: the column comes with the 2026-10-02 migration, and the
  // status above must be saved even before that runs.
  if (result.failedRecipients.length > 0) {
    try {
      await sql`
        UPDATE email_broadcasts
        SET failed_recipients = ${sql.json(result.failedRecipients as any)}
        WHERE id = ${broadcastId}
      `;
    } catch (recordErr) {
      console.error('[broadcasts:send] could not record failed recipients', recordErr);
    }
  }
}

export async function GET(_req: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  const authz = await authorizeBroadcastAccess(params.communitySlug);
  if (!authz.ok) return authz.response;
  const { community } = authz;

  const rows = await query<BroadcastListRow>`
    SELECT id, subject, recipient_count, status, sent_at, created_at
    FROM email_broadcasts
    WHERE community_id = ${community.id}
    ORDER BY created_at DESC
    LIMIT 100
  `;
  return NextResponse.json({ broadcasts: rows });
}
