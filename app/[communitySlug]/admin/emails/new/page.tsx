import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';
import { getQuota } from '@/lib/broadcasts/quota';
import { getActiveRecipientsForCommunity } from '@/lib/broadcasts/recipients';
import { EmailComposer } from '@/components/emails/EmailComposer';

export default async function NewEmailPage({ params }: { params: { communitySlug: string } }) {
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
    <EmailComposer
      communityId={community.id}
      communitySlug={params.communitySlug}
      communityName={community.name}
      ownerEmail={session.user.email}
      activeMemberCount={recipients.length}
      quota={quota}
    />
  );
}
