import { getCommunityBySlug } from '@/lib/community-data';
import { getOfferings } from '@/lib/offerings';
import { attentionCount, getAttention } from '@/lib/admin/attention';
import { AdminNav } from '@/components/community-admin/admin-nav';

export default async function AdminWithNavLayout(
  props: {
    children: React.ReactNode;
    params: Promise<{ communitySlug: string }>;
  }
) {
  const params = await props.params;
  const { children } = props;

  // Auth + ownership is already enforced in the parent admin/layout.tsx.
  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) return null;

  const attention = await getAttention(community);
  const showEmails = process.env.NEXT_PUBLIC_BROADCASTS_ENABLED === 'true' || !!community.is_broadcast_vip;

  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[224px_minmax(0,1fr)] md:gap-9">
      <AdminNav
        slug={params.communitySlug}
        offerings={getOfferings(community)}
        attention={attentionCount(attention)}
        showEmails={showEmails}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
