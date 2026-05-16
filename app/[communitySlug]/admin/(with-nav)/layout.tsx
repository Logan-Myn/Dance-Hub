import { getCommunityBySlug } from '@/lib/community-data';
import { AdminNav } from '@/components/admin/AdminNav';

export default async function AdminWithNavLayout(
  props: {
    children: React.ReactNode;
    params: Promise<{ communitySlug: string }>;
  }
) {
  const params = await props.params;
  const { children } = props;

  // Auth + ownership is already enforced in the parent admin/layout.tsx,
  // but we still need the community name + slug to render the nav.
  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) return null;

  return (
    <div className="flex flex-col md:flex-row gap-3 lg:gap-4">
      <AdminNav
        communitySlug={params.communitySlug}
        communityName={community.name}
      />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
