import Link from "next/link";
import Navbar from "@/app/components/Navbar";
import { getSession } from "@/lib/auth-session";
import { getProfileForUser } from "@/lib/community-data";
import HomePageClient from "./HomePageClient";

export const dynamic = "force-dynamic";

const VIOLET = "#7c3aed"; // violet-600

export default async function LandingPage() {
  const session = await getSession();
  const profile = session ? await getProfileForUser(session.user.id) : null;

  return (
    <>
      <div
        style={{
          background: "linear-gradient(to right, #7c3aed, #9333ea, #c026d3)",
          color: "white",
          padding: "10px 20px",
          textAlign: "center",
          fontSize: 13,
          letterSpacing: 0.2,
        }}
      >
        <span
          style={{
            background: "white",
            color: VIOLET,
            fontWeight: 700,
            padding: "3px 9px",
            borderRadius: 6,
            fontSize: 11,
            letterSpacing: 1,
            marginRight: 14,
          }}
        >
          LAUNCH
        </span>
        <span style={{ opacity: 0.95 }}>
          Run your community with <b>0% platform fees</b> for your first 30 days.
        </span>{" "}
        <Link
          href="/onboarding"
          style={{ color: "white", fontWeight: 600, textDecoration: "underline", marginLeft: 8 }}
        >
          Start now →
        </Link>
      </div>
      <Navbar initialUser={session?.user ?? null} initialProfile={profile} />
      <HomePageClient />
    </>
  );
}
