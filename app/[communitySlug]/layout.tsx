import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import {
  getCommunityBySlug,
  getCommunityMembership,
  getProfileForUser,
} from '@/lib/community-data';
import Navbar from '@/app/components/Navbar';
import CommunityNavbar from '@/components/CommunityNavbar';

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
  const [isMember, navProfile] = await Promise.all([
    session ? getCommunityMembership(community.id, session.user.id) : Promise.resolve(false),
    session ? getProfileForUser(session.user.id) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Navbar
        initialUser={session?.user ?? null}
        initialProfile={navProfile}
      />
      <CommunityNavbar
        communitySlug={params.communitySlug}
        isMember={isMember}
        isOwner={isOwner}
      />
      <main className="flex-grow">{children}</main>
    </div>
  );
}
