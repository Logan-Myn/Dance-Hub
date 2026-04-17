import Navbar from "@/app/components/Navbar";
import { getSession } from "@/lib/auth-session";
import { getProfileForUser } from "@/lib/community-data";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const profile = session ? await getProfileForUser(session.user.id) : null;
  return (
    <div className="min-h-screen bg-background">
      <Navbar initialUser={session?.user ?? null} initialProfile={profile} />
      <main>{children}</main>
    </div>
  );
}
