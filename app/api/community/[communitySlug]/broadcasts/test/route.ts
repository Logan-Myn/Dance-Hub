import { NextResponse } from 'next/server';
import { authorizeBroadcastAccess } from '@/lib/broadcasts/auth';
import { runBroadcast } from '@/lib/broadcasts/sender';
import { queryOne } from '@/lib/db';

async function ensureUnsubscribeToken(email: string): Promise<string | null> {
  // The schema's DEFAULT generates a token on insert. ON CONFLICT preserves
  // any existing token. RETURNING gives us the token in either case.
  const row = await queryOne<{ unsubscribe_token: string | null }>`
    INSERT INTO email_preferences (user_id, email)
    SELECT id, email FROM profiles WHERE email = ${email}
    ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email
    RETURNING unsubscribe_token
  `;
  if (row?.unsubscribe_token) return row.unsubscribe_token;
  // Fallback for the case where no profiles row matched the session email.
  const existing = await queryOne<{ unsubscribe_token: string | null }>`
    SELECT unsubscribe_token FROM email_preferences WHERE email = ${email}
  `;
  return existing?.unsubscribe_token ?? null;
}

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

    const unsubscribeToken = await ensureUnsubscribeToken(session.user.email);

    const result = await runBroadcast({
      broadcastId: 'test',
      communityId: community.id,
      subject: `[TEST] ${subject}`,
      htmlContent,
      previewText,
      recipients: [
        {
          userId: session.user.id,
          email: session.user.email,
          displayName: (session.user as { name?: string }).name || 'there',
          unsubscribeToken,
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
