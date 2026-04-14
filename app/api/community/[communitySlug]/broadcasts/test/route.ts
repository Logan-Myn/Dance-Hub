import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';
import { runBroadcast } from '@/lib/broadcasts/sender';

export async function POST(
  req: Request,
  { params }: { params: { communitySlug: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const community = await queryOne<{ id: string; name: string; created_by: string }>`
    SELECT id, name, created_by FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (community.created_by !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { subject, htmlContent, previewText } = (await req.json()) as {
    subject: string;
    htmlContent: string;
    previewText?: string;
  };
  if (!subject || !htmlContent) {
    return NextResponse.json({ error: 'Missing subject or htmlContent' }, { status: 400 });
  }

  const result = await runBroadcast({
    broadcastId: 'test',
    subject: `[TEST] ${subject}`,
    htmlContent,
    previewText,
    recipients: [
      {
        userId: session.user.id,
        email: session.user.email,
        displayName: (session.user as { name?: string }).name || 'there',
        unsubscribeToken: null,
      },
    ],
    fromName: community.name,
    replyTo: session.user.email,
  });

  return NextResponse.json({ status: result.status, failedCount: result.failedCount });
}
