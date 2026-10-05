import { preload } from "react-dom";
import Navbar from "@/app/components/Navbar";
import { getSession } from "@/lib/auth-session";
import { getProfileForUser } from "@/lib/community-data";
import HomePageClient from "./HomePageClient";
import { StartCommunityLink } from "@/components/StartCommunityLink";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  // Hero video poster: kick off the fetch before MuxPlayer hydrates so the
  // image isn't gated behind the JS bundle.
  preload("/landing-video-poster.jpg", { as: "image" });

  const session = await getSession();
  const profile = session ? await getProfileForUser(session.user.id) : null;

  return (
    <>
      <div className="bg-brand-soft px-4 py-2.5 text-center text-[13px] text-brand-ink">
        <span className="mr-2.5 inline-block rounded-md bg-brand px-2 py-0.5 text-[11.5px] font-bold text-white">Launch</span>
        Run your community with <b className="font-semibold">0% platform fees</b> for your first 15 days.{" "}
        <StartCommunityLink className="ml-1 font-semibold underline underline-offset-[3px] hover:text-brand">Start now</StartCommunityLink>
      </div>
      <Navbar initialUser={session?.user ?? null} initialProfile={profile} />
      <HomePageClient />
    </>
  );
}
