import { queryOne } from '@/lib/db';
import { GeneralSettingsForm } from '@/components/admin/GeneralSettingsForm';

// Match the Emails/Dashboard admin pages: opt out of the data cache so the RSC
// re-renders with fresh data after each mutation + router.refresh().
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

interface CommunityRow {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  custom_links: unknown;
  slug: string;
  status: string | null;
  opening_date: string | null;
  can_change_opening_date: boolean | null;
}

export default async function GeneralSettingsPage({
  params,
}: {
  params: { communitySlug: string };
}) {
  const community = await queryOne<CommunityRow>`
    SELECT id, name, description, image_url, custom_links, slug, status, opening_date, can_change_opening_date
    FROM communities
    WHERE slug = ${params.communitySlug}
  `;
  if (!community) return null;

  const initialCustomLinks = Array.isArray(community.custom_links)
    ? (community.custom_links as { title: string; url: string }[])
    : [];

  // `can_change_opening_date` is a direct column on `communities` (see the GET
  // handler in app/api/community/[communitySlug]/route.ts). Default to true
  // when null so first-time editors aren't blocked.
  const canChangeOpeningDate = community.can_change_opening_date ?? true;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-500">
      <header className="mb-10">
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-foreground">
          General
        </h1>
      </header>

      <GeneralSettingsForm
        communitySlug={params.communitySlug}
        initialName={community.name}
        initialDescription={community.description ?? ''}
        initialImageUrl={community.image_url ?? ''}
        initialCustomLinks={initialCustomLinks}
        currentSlug={community.slug}
        initialStatus={community.status ?? 'active'}
        initialOpeningDate={community.opening_date}
        canChangeOpeningDate={canChangeOpeningDate}
      />
    </div>
  );
}
