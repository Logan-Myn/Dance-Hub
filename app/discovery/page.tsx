import Navbar from "@/app/components/Navbar";
import { getSession } from "@/lib/auth-session";
import { getProfileForUser } from "@/lib/community-data";
import DiscoveryClient from "./DiscoveryClient";

export const dynamic = 'force-dynamic';

export default async function DiscoveryPage() {
  const session = await getSession();
  const profile = session ? await getProfileForUser(session.user.id) : null;

  return (
    <>
      <Navbar initialUser={session?.user ?? null} initialProfile={profile} />
      <DiscoveryClient />
    </>
  );
}
