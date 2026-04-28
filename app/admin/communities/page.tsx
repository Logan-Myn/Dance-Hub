import { getAllAdminCommunities } from '@/lib/admin-platform/communities';
import { CommunitiesTable } from '@/components/admin/platform/CommunitiesTable';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function CommunitiesPage() {
  const communities = await getAllAdminCommunities();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500 space-y-8">
      <header>
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">
          Communities
        </h1>
        <p className="text-muted-foreground mt-2">
          {communities.length.toLocaleString()}{' '}
          {communities.length === 1 ? 'community' : 'communities'} on the platform.
        </p>
      </header>

      <CommunitiesTable communities={communities} />
    </div>
  );
}
