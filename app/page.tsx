import { Sparkles, ArrowRight } from "lucide-react";
import Navbar from "@/app/components/Navbar";
import { getSession } from "@/lib/auth-session";
import { getProfileForUser } from "@/lib/community-data";
import HomePageClient from "./HomePageClient";

export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  const session = await getSession();
  const profile = session ? await getProfileForUser(session.user.id) : null;

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-neutral-950">
      {/* Promotional Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20"></div>
        <div className="relative py-3 px-4 text-center">
          <p className="text-sm md:text-base font-medium text-white">
            <Sparkles className="inline w-4 h-4 mr-1" />
            <span className="font-bold">Launch Special:</span> Zero platform fees for your first 30 days
            <ArrowRight className="inline w-4 h-4 ml-1" />
          </p>
        </div>
      </div>

      <Navbar initialUser={session?.user ?? null} initialProfile={profile} />

      <HomePageClient />
    </div>
  );
}
