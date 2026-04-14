import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';

export async function GET(
  _req: Request,
  { params }: { params: { communitySlug: string; broadcastId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const community = await queryOne<{ id: string; created_by: string }>`
    SELECT id, created_by FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (community.created_by !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const broadcast = await queryOne`
    SELECT id, subject, html_content, editor_json, preview_text, recipient_count,
           status, error_message, sent_at, created_at
    FROM email_broadcasts
    WHERE id = ${params.broadcastId} AND community_id = ${community.id}
  `;
  if (!broadcast) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(broadcast);
}
