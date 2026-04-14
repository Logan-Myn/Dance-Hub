import Link from 'next/link';
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';
import { getQuota } from '@/lib/broadcasts/quota';
import { getActiveRecipientsForCommunity } from '@/lib/broadcasts/recipients';
import { EmailComposer } from '@/components/emails/EmailComposer';

export const dynamic = 'force-dynamic';

export default async function NewEmailPage({
  params,
}: {
  params: { communitySlug: string };
}) {
  const session = await getSession();
  if (!session) return null;

  const community = await queryOne<{ id: string; name: string }>`
    SELECT id, name FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) return null;

  const [quota, recipients] = await Promise.all([
    getQuota(community.id),
    getActiveRecipientsForCommunity(community.id),
  ]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500">
      <Link
        href={`/${params.communitySlug}/admin/emails`}
        className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <span className="mr-1.5">←</span>
        Back to archive
      </Link>

      <header className="mb-10">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-3">
          New broadcast
        </p>
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">
          Write an issue
        </h1>
      </header>

      <EmailComposer
        communityId={community.id}
        communitySlug={params.communitySlug}
        communityName={community.name}
        ownerEmail={session.user.email}
        activeMemberCount={recipients.length}
        quota={quota}
      />
    </div>
  );
}
