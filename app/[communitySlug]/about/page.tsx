import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import {
  getCommunityBySlug,
  getMembershipStatus,
  getPublicProfile,
} from '@/lib/community-data';
import { getOfferings } from '@/lib/offerings';
import { getAboutData } from '@/lib/about/data';
import { isAuto, normalizeAboutPage, suggestedTemplate, templateBlocks } from '@/lib/about/model';
import AboutClient from './AboutClient';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// The moment this request renders; the page's clock starts here.
function requestTime(): number {
  return Date.now();
}

const chosenZone = (tz: string | null | undefined) => (tz && tz !== 'UTC' ? tz : null);

export async function generateMetadata(props: { params: Promise<{ communitySlug: string }> }): Promise<Metadata> {
  const { communitySlug } = await props.params;
  const community = await getCommunityBySlug(communitySlug);
  if (!community) return {};
  const description = community.description || `Join ${community.name} on Dance-Hub.`;
  return {
    title: `${community.name} | Dance-Hub`,
    description,
    openGraph: {
      title: community.name,
      description,
      images: community.image_url ? [community.image_url] : undefined,
    },
  };
}

export default async function AboutPage(
  props: {
    params: Promise<{ communitySlug: string }>;
  }
) {
  const params = await props.params;
  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) notFound();

  // Public page: visitors are welcome. A session only decides member and
  // owner state.
  const session = await getSession();
  const isOwner = !!session && community.created_by === session.user.id;
  const now = requestTime();
  const offered = getOfferings(community);

  const [membership, teacher, viewerProfile, data] = await Promise.all([
    session ? getMembershipStatus(community.id, session.user.id) : Promise.resolve(null),
    getPublicProfile(community.created_by),
    session ? getPublicProfile(session.user.id) : Promise.resolve(null),
    getAboutData(community, offered, new Date(now)),
  ]);

  // A page the owner never set up starts from the template that fits what
  // they offer, so visitors always see something and a way to join.
  const saved = normalizeAboutPage(community.about_page);
  const template = templateBlocks(suggestedTemplate(offered), offered);
  // Pages from the old builder keep the owner's content first, then get the
  // automatic blocks for what the community offers. Saving stores the result.
  const legacy = !!saved && (community.about_page as { version?: unknown } | null)?.version !== 2;
  const blocks = !saved ? template : legacy ? [...saved.sections, ...template.filter((b) => isAuto(b.type))] : saved.sections;

  const monthly = community.membership_enabled ? Number(community.membership_price ?? 0) : 0;
  const yearly = community.yearly_enabled && Number(community.yearly_price ?? 0) > 0 ? Number(community.yearly_price) : null;
  const status = (['active', 'pre_registration', 'inactive'] as const).find((s) => s === community.status) ?? 'active';
  const customLinks = (Array.isArray(community.custom_links) ? community.custom_links : []) as Array<{ title?: string; url?: string }>;

  return (
    <AboutClient
      community={{
        id: community.id,
        slug: community.slug,
        name: community.name,
        description: community.description ?? '',
        imageUrl: community.image_url ?? null,
        imageFocalX: community.image_focal_x ?? 50,
        imageFocalY: community.image_focal_y ?? 50,
        imageZoom: Number(community.image_zoom ?? 1),
        links: customLinks.filter((l) => typeof l.url === 'string').map((l) => ({ title: l.title ?? '', url: l.url! })),
        membershipEnabled: !!community.membership_enabled,
        membershipPrice: monthly,
        yearlyEnabled: !!community.yearly_enabled,
        yearlyPrice: yearly ?? undefined,
        stripeAccountId: community.stripe_account_id ?? null,
      }}
      initialBlocks={blocks}
      initialFinalCta={saved?.finalCta ?? null}
      customized={!!saved}
      teacher={{
        id: community.created_by,
        name: teacher?.name ?? 'The teacher',
        avatarUrl: teacher?.avatarUrl ?? null,
      }}
      offered={offered}
      data={data}
      pricing={{ paid: monthly > 0, monthly, yearly }}
      join={{
        status,
        openingDate:
          community.opening_date instanceof Date ? community.opening_date.toISOString() : community.opening_date ?? null,
        isMember: !!membership?.isMember || isOwner,
        isPreRegistered: !!membership?.isPreRegistered,
        canceling: membership?.subscriptionStatus === 'canceling',
        accessEndDate: membership?.subscriptionStatus === 'canceling' ? membership.currentPeriodEnd : null,
      }}
      isOwner={isOwner}
      viewerZone={chosenZone(viewerProfile?.timezone)}
      serverNow={now}
    />
  );
}
