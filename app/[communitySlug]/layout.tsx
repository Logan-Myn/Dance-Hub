import Script from 'next/script';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import {
  getCommunityBySlug,
  getCommunityMembership,
  getProfileForUser,
  getUserIsAdmin,
} from '@/lib/community-data';
import TopBar from '@/components/community-shell/top-bar';
import MobileNav from '@/components/MobileNav';
import { getOfferings } from '@/lib/offerings';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function CommunityLayout(
  props: {
    children: React.ReactNode;
    params: Promise<{ communitySlug: string }>;
  }
) {
  const params = await props.params;

  const {
    children
  } = props;

  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) notFound();

  const session = await getSession();
  const isOwner = !!session && community.created_by === session.user.id;
  const [isMember, navProfile, isAdmin] = await Promise.all([
    session ? getCommunityMembership(community.id, session.user.id) : Promise.resolve(false),
    session ? getProfileForUser(session.user.id) : Promise.resolve(null),
    session ? getUserIsAdmin(session.user.id) : Promise.resolve(false),
  ]);

  const offerings = getOfferings(community);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <Script src="https://js.stripe.com/v3/" strategy="afterInteractive" />
      {/* Desktop: one merged bar (hidden below md inside the component) */}
      <TopBar
        communitySlug={params.communitySlug}
        communityName={community.name}
        communityImageUrl={community.image_url}
        isMember={isMember}
        isOwner={isOwner}
        isAdmin={isAdmin}
        offerings={offerings}
        initialUser={session?.user ?? null}
        profile={navProfile}
      />

      {/* Phone: top header + bottom tab bar (hidden at md+) */}
      <MobileNav
        communitySlug={params.communitySlug}
        communityName={community.name}
        communityImageUrl={community.image_url}
        isMember={isMember}
        isOwner={isOwner}
        isAdmin={isAdmin}
        offerings={offerings}
        user={session?.user ?? null}
        profile={navProfile}
      />

      {/* Clear the phone tab bar (~5rem) plus any iOS safe-area inset; md:pb-0 removes it on desktop */}
      <main className="flex-grow pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
    </div>
  );
}
