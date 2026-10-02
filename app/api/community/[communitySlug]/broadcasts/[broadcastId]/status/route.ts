import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { authorizeBroadcastAccess } from '@/lib/broadcasts/auth';

export const dynamic = 'force-dynamic';

/**
 * Where a send stands, for the composer to poll after publishing (the send
 * runs after the publish request has answered).
 */
export async function GET(
  _req: Request,
  props: { params: Promise<{ communitySlug: string; broadcastId: string }> }
) {
  const params = await props.params;
  const authz = await authorizeBroadcastAccess(params.communitySlug);
  if (!authz.ok) return authz.response;
  const { community } = authz;

  // failed_recipients is read through to_jsonb so this works (as an unknown
  // count, null) before the 2026-10-02 migration adds the column.
  const row = await queryOne<{ status: string; recipient_count: number; failed_count: number | null }>`
    SELECT b.status, b.recipient_count,
           jsonb_array_length(to_jsonb(b) -> 'failed_recipients') AS failed_count
    FROM email_broadcasts b
    WHERE b.id = ${params.broadcastId} AND b.community_id = ${community.id}
  `;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    status: row.status,
    recipientCount: row.recipient_count,
    failedCount: row.failed_count,
  });
}
