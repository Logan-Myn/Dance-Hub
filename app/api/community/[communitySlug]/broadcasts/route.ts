import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { queryOne, query, sql } from '@/lib/db';
import { checkCanSend } from '@/lib/broadcasts/quota';
import { getActiveRecipientsForCommunity } from '@/lib/broadcasts/recipients';
import { runBroadcast } from '@/lib/broadcasts/sender';

interface CommunityRow {
  id: string;
  name: string;
  created_by: string;
}

interface BroadcastListRow {
  id: string;
  subject: string;
  recipient_count: number;
  status: string;
  sent_at: string | null;
  created_at: string;
}

export async function POST(
  req: Request,
  { params }: { params: { communitySlug: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const community = await queryOne<CommunityRow>`
    SELECT id, name, created_by FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (community.created_by !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { subject, htmlContent, editorJson, previewText } = (await req.json()) as {
    subject: string;
    htmlContent: string;
    editorJson: unknown;
    previewText?: string;
  };
  if (!subject || !htmlContent || !editorJson) {
    return NextResponse.json(
      { error: 'Missing subject/htmlContent/editorJson' },
      { status: 400 }
    );
  }

  const gate = await checkCanSend(community.id);
  if (!gate.allowed) {
    const httpStatus = gate.reason === 'soft_cap_reached' ? 429 : 402;
    return NextResponse.json({ error: gate.reason, quota: gate.quota }, { status: httpStatus });
  }

  const inserted = await queryOne<{ id: string }>`
    INSERT INTO email_broadcasts
      (community_id, sender_user_id, subject, html_content, editor_json, preview_text,
       recipient_count, status)
    VALUES
      (${community.id}, ${session.user.id}, ${subject}, ${htmlContent},
       ${JSON.stringify(editorJson)}::jsonb, ${previewText ?? null}, 0, 'sending')
    RETURNING id
  `;
  if (!inserted) return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
  const broadcastId = inserted.id;

  const recipients = await getActiveRecipientsForCommunity(community.id);
  if (recipients.length === 0) {
    await sql`UPDATE email_broadcasts SET status = 'failed', error_message = 'no_recipients' WHERE id = ${broadcastId}`;
    return NextResponse.json({ error: 'no_recipients' }, { status: 422 });
  }

  await sql`UPDATE email_broadcasts SET recipient_count = ${recipients.length} WHERE id = ${broadcastId}`;

  const result = await runBroadcast({
    broadcastId,
    subject,
    htmlContent,
    previewText,
    recipients,
    fromName: community.name,
    replyTo: session.user.email,
  });

  await sql`
    UPDATE email_broadcasts
    SET status = ${result.status},
        resend_batch_ids = ${result.resendBatchIds},
        error_message = ${result.errorMessage ?? null},
        sent_at = ${result.status === 'sent' || result.status === 'partial_failure' ? new Date() : null}
    WHERE id = ${broadcastId}
  `;

  return NextResponse.json({
    broadcastId,
    recipientCount: recipients.length,
    status: result.status,
    successfulCount: result.successfulCount,
    failedCount: result.failedCount,
  });
}

export async function GET(
  _req: Request,
  { params }: { params: { communitySlug: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const community = await queryOne<CommunityRow>`
    SELECT id, name, created_by FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (community.created_by !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rows = await query<BroadcastListRow>`
    SELECT id, subject, recipient_count, status, sent_at, created_at
    FROM email_broadcasts
    WHERE community_id = ${community.id}
    ORDER BY created_at DESC
    LIMIT 100
  `;
  return NextResponse.json({ broadcasts: rows });
}
