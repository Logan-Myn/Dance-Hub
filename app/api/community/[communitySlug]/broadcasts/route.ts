import { NextResponse } from 'next/server';
import { queryOne, query, sql } from '@/lib/db';
import { authorizeBroadcastAccess } from '@/lib/broadcasts/auth';
import { checkCanSend } from '@/lib/broadcasts/quota';
import { getActiveRecipientsForCommunity } from '@/lib/broadcasts/recipients';
import { runBroadcast } from '@/lib/broadcasts/sender';
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

    const result = await runBroadcast({
      broadcastId,
      communityId: community.id,
      subject,
      htmlContent,
      previewText,
      recipients,
      fromName: community.name,
      replyTo: 'hello@dance-hub.io',
    });

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
        console.error('[broadcasts:POST] could not record failed recipients', recordErr);
      }
    }

    return NextResponse.json({
      broadcastId,
      recipientCount: recipients.length,
      status: result.status,
      successfulCount: result.successfulCount,
      failedCount: result.failedCount,
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
