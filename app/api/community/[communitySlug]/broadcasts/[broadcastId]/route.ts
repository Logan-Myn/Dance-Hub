import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { authorizeBroadcastAccess } from '@/lib/broadcasts/auth';
import { sanitizeEmailHtml } from '@/lib/sanitize-html';

export async function GET(
  _req: Request,
  props: { params: Promise<{ communitySlug: string; broadcastId: string }> }
) {
  const params = await props.params;
  const authz = await authorizeBroadcastAccess(params.communitySlug);
  if (!authz.ok) return authz.response;
  const { community } = authz;

  const broadcast = await queryOne<{ html_content: string | null }>`
    SELECT id, subject, html_content, editor_json, preview_text, recipient_count,
           status, error_message, sent_at, created_at
    FROM email_broadcasts
    WHERE id = ${params.broadcastId} AND community_id = ${community.id}
  `;
  if (!broadcast) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Rows stored before write-time sanitizing may hold unsafe markup.
  return NextResponse.json({ ...broadcast, html_content: sanitizeEmailHtml(broadcast.html_content) });
}
