import { NextResponse } from 'next/server';
import { authorizeBroadcastAccess } from '@/lib/broadcasts/auth';
import { runBroadcast } from '@/lib/broadcasts/sender';

export async function POST(
  req: Request,
  { params }: { params: { communitySlug: string } }
) {
  const authz = await authorizeBroadcastAccess(params.communitySlug);
  if (!authz.ok) return authz.response;
  const { session, community } = authz;

  try {
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
      replyTo: 'hello@dance-hub.io',
    });

    return NextResponse.json({ status: result.status, failedCount: result.failedCount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    console.error('[broadcasts:test] failed', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
