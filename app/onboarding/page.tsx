"use client";

import React from "react";
import Link from "next/link";
import { CalendarClock, GraduationCap, MessagesSquare, Radio, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import OnboardingForm from "@/app/onboarding/OnboardingForm";
import { useAuth } from "@/contexts/AuthContext";

const OFFER = [
  { Icon: MessagesSquare, text: "A community feed your students actually open" },
  { Icon: GraduationCap, text: "A classroom for your courses, with progress" },
  { Icon: Radio, text: "Live classes in one click" },
  { Icon: CalendarClock, text: "Private lessons, paid up front" },
  { Icon: Wallet, text: "Memberships, with payouts to your bank" },
];

export default function OnboardingPage() {
  const { user, session, loading } = useAuth();
  const router = useRouter();
  const signedOut = !loading && (!session || !user);

  React.useEffect(() => {
    // Nothing here to show a signed-out visitor. Send them back to the home
    // page, where the sign-up modal opens on top of the landing page instead of
    // on a bare interstitial. They return here once they're signed in.
    if (signedOut) {
      router.replace("/?auth=signup&redirect=%2Fonboarding");
    }
  }, [signedOut, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-line border-t-brand" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas px-4 pb-12 pt-6 sm:pt-10">
      <div className="mx-auto max-w-[1000px]">
        <Link href="/" aria-label="Dance-Hub home" className="inline-flex items-center gap-2.5 font-display text-[17px] font-semibold text-ink">
          <span aria-hidden="true" className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-brand text-[13px] font-bold tracking-tight text-white">
            DH
          </span>
          Dance-Hub
        </Link>

        <div className="mt-6 grid overflow-hidden rounded-[20px] border border-line bg-surface shadow-raised md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <aside className="order-2 flex flex-col gap-5 bg-brand-soft p-6 sm:p-9 md:order-1">
            <h2 className="text-balance font-display text-[22px] font-semibold leading-[1.2] text-ink sm:text-[24px]">
              Everything you need to teach dance online, in one place.
            </h2>
            <ul className="flex flex-col gap-3">
              {OFFER.map(({ Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-[15px] text-ink">
                  <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-surface text-brand-ink shadow-card">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
            <p className="rounded-xl bg-surface px-4 py-3 text-[14px] text-ink-2 shadow-card">
              <strong className="block text-[15px] text-ink">0% platform fees for your first 15 days</strong>
              After that, a small share of what you earn, dropping as you grow.
            </p>
            <p className="mt-auto text-[13.5px] text-ink-2">
              Questions?{" "}
              <a href="mailto:hello@dance-hub.io" className="font-semibold text-brand-ink hover:underline hover:underline-offset-[3px]">
                hello@dance-hub.io
              </a>
            </p>
          </aside>

          <section aria-labelledby="create-h" className="order-1 p-6 sm:p-9 md:order-2">
            <h1 id="create-h" className="font-display text-[26px] font-semibold leading-[1.15] tracking-[-0.01em] text-ink sm:text-[30px]">
              Create your community
            </h1>
            <p className="mb-6 mt-1.5 text-[15px] text-ink-2">It takes a minute. You can change all of it later in Admin.</p>
            <OnboardingForm />
          </section>
        </div>
      </div>
    </div>
  );
}
