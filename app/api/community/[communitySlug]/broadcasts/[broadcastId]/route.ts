import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { authorizeBroadcastAccess } from '@/lib/broadcasts/auth';

export async function GET(
  _req: Request,
  { params }: { params: { communitySlug: string; broadcastId: string } }
) {
  const authz = await authorizeBroadcastAccess(params.communitySlug);
  if (!authz.ok) return authz.response;
  const { community } = authz;

  const broadcast = await queryOne`
    SELECT id, subject, html_content, editor_json, preview_text, recipient_count,
           status, error_message, sent_at, created_at
    FROM email_broadcasts
    WHERE id = ${params.broadcastId} AND community_id = ${community.id}
  `;
  if (!broadcast) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(broadcast);
}
