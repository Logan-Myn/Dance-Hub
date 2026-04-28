import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import {
  getCommunityBySlug,
  getCommunityMembership,
  getProfileForUser,
  getUserIsAdmin,
} from '@/lib/community-data';
import Navbar from '@/app/components/Navbar';
import CommunityNavbar from '@/components/CommunityNavbar';
import MobileNav from '@/components/MobileNav';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function CommunityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { communitySlug: string };
}) {
  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) notFound();

  const session = await getSession();
  const isOwner = !!session && community.created_by === session.user.id;
  const [isMember, navProfile, isAdmin] = await Promise.all([
    session ? getCommunityMembership(community.id, session.user.id) : Promise.resolve(false),
    session ? getProfileForUser(session.user.id) : Promise.resolve(null),
    session ? getUserIsAdmin(session.user.id) : Promise.resolve(false),
  ]);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Desktop nav — hidden below md */}
      <div className="hidden md:block">
        <Navbar
          initialUser={session?.user ?? null}
          initialProfile={navProfile}
        />
        <CommunityNavbar
          communitySlug={params.communitySlug}
          isMember={isMember}
          isOwner={isOwner}
          isAdmin={isAdmin}
        />
      </div>

      {/* Mobile nav — hidden at md+ */}
      <MobileNav
        communitySlug={params.communitySlug}
        communityName={community.name}
        communityImageUrl={community.image_url}
        isMember={isMember}
        isOwner={isOwner}
        isAdmin={isAdmin}
        user={session?.user ?? null}
        profile={navProfile}
      />

      {/* Clear the mobile bottom tab bar (~5rem) plus any iOS safe-area inset; md:pb-0 removes it on desktop */}
      <main className="flex-grow pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
    </div>
  );
}
