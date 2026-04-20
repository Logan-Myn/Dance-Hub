import { queryOne } from '@/lib/db';
import { ThreadCategoriesEditor } from '@/components/admin/ThreadCategoriesEditor';
import type { ThreadCategory } from '@/types/community';

// Match the other admin pages (Emails/General/Subscriptions): opt out of the
// data cache so the RSC re-renders with fresh `communities.thread_categories`
// after each mutation + router.refresh().
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

interface CommunityRow {
  id: string;
  thread_categories: unknown;
}

export default async function ThreadCategoriesPage({
  params,
}: {
  params: { communitySlug: string };
}) {
  // `thread_categories` is a JSONB column on the communities table storing the
  // full ordered array of ThreadCategory objects (see supabase/migrations/001
  // and app/api/community/[communitySlug]/categories/route.ts, which PUTs the
  // whole array back). There is no separate categories table, so we read the
  // array as-is and hand it to the client island.
  const community = await queryOne<CommunityRow>`
    SELECT id, thread_categories
    FROM communities
    WHERE slug = ${params.communitySlug}
  `;
  if (!community) return null;

  const categories: ThreadCategory[] = Array.isArray(community.thread_categories)
    ? (community.thread_categories as ThreadCategory[])
    : [];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500">
      <header className="mb-10">
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">
          Thread Categories
        </h1>
      </header>

      <ThreadCategoriesEditor
        communitySlug={params.communitySlug}
        initialCategories={categories}
      />
    </div>
  );
}
