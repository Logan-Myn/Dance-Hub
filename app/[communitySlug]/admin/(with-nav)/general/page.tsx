import { requireCommunityManagerPage } from '@/lib/community-auth';
import { queryOne } from '@/lib/db';
import { GeneralSettingsForm } from '@/components/admin/GeneralSettingsForm';
import { PRE_REGISTERED_STATUSES } from '@/lib/community-status';

// Match the Emails/Dashboard admin pages: opt out of the data cache so the RSC
// re-renders with fresh data after each mutation + router.refresh().
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

interface CommunityRow {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  image_focal_x: number | null;
  image_focal_y: number | null;
  image_zoom: string | number | null;
  custom_links: unknown;
  slug: string;
  status: string | null;
  opening_date: string | null;
  can_change_opening_date: boolean | null;
}

export default async function GeneralSettingsPage(
  props: {
    params: Promise<{ communitySlug: string }>;
  }
) {
  const params = await props.params;
  await requireCommunityManagerPage(params.communitySlug);
  const community = await queryOne<CommunityRow>`
    SELECT id, name, description, image_url, image_focal_x, image_focal_y, image_zoom,
           custom_links, slug, status, opening_date, can_change_opening_date
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

  // Once someone has pre-registered (and until the community opens), the
  // update route refuses status and opening-date changes; the form disables
  // those fields and says why.
  const preRegistered =
    community.status === 'pre_registration'
      ? await queryOne<{ count: number }>`
          SELECT COUNT(*)::int AS count
          FROM community_members
          WHERE community_id = ${community.id}
            AND status = ANY(${PRE_REGISTERED_STATUSES as string[]})
        `
      : null;
  const hasPreRegistrations = (preRegistered?.count ?? 0) > 0;

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
        initialFocalX={community.image_focal_x ?? 50}
        initialFocalY={community.image_focal_y ?? 50}
        initialZoom={Number(community.image_zoom ?? 1)}
        initialCustomLinks={initialCustomLinks}
        currentSlug={community.slug}
        initialStatus={community.status ?? 'active'}
        initialOpeningDate={community.opening_date}
        canChangeOpeningDate={canChangeOpeningDate}
        hasPreRegistrations={hasPreRegistrations}
      />
    </div>
  );
}
