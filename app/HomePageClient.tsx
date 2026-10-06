"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import MuxPlayer from "@mux/mux-player-react/lazy";
import { ArrowRight, CalendarClock, ChevronDown, GraduationCap, MessagesSquare, Radio, Wallet } from "lucide-react";
import { BTN_PRIMARY } from "@/components/community-feed/feed-header";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { authModalRequestFromSearch } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";

const MUX_PRODUCT_TOUR_PLAYBACK_ID = "vzZ81ggS02IvBXaQ3W5PRtv6YkApzQOZ6l282102OZJuI";

// Same type scale as the community pages: Outfit for headings, Figtree for text.
const H1 = "text-balance font-display text-[42px] font-semibold leading-[1.04] tracking-[-0.03em] text-ink sm:text-[60px] lg:text-[74px]";
const H2 = "text-balance font-display text-[30px] font-semibold leading-[1.08] tracking-[-0.02em] text-ink sm:text-[42px]";
const LEAD = "text-[16px] leading-[1.6] text-ink-2 sm:text-[17px]";
const LABEL = "text-[14px] font-semibold text-brand-ink";
const CTA = cn(BTN_PRIMARY, "h-12 gap-2 px-6 text-[16px] shadow-raised transition-[transform,box-shadow,background-color] hover:-translate-y-px");

function StartButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn(CTA, className)}>
      Start your community
      <ArrowRight className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

// ── Hero ──
function Hero({ onCtaSignup }: { onCtaSignup: () => void }) {
  return (
    <section className="mx-auto max-w-[1240px] px-4 pb-8 pt-10 text-center sm:px-8 sm:pt-14">
      <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3.5 py-1.5 text-[13px] font-semibold text-brand-ink">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand" />
        Made for dance teachers
      </span>
      <h1 className={cn(H1, "mx-auto mt-6 max-w-[1000px]")}>
        Turn your followers
        <br />
        into <span className="text-brand">paying students.</span>
      </h1>
      <p className={cn(LEAD, "mx-auto mt-5 max-w-[720px]")}>
        Build a paid community from the audience you already have.
        <br className="hidden sm:block" /> Courses, live classes, and 1-on-1 lessons in one place.
      </p>
      <ProductTourVideo />
      <StartButton onClick={onCtaSignup} />
      <p className="mt-4 text-[13.5px] text-ink-3">0% platform fees for the first 15 days. Live in 5 minutes.</p>
    </section>
  );
}

function ProductTourVideo() {
  return (
    <div
      className="relative mx-auto mb-9 mt-9 aspect-video max-w-[880px] cursor-pointer overflow-hidden rounded-[20px] border border-line bg-surface-2 shadow-overlay"
      style={{ ["--bottom-controls" as string]: "none" }}
    >
      <MuxPlayer
        streamType="on-demand"
        playbackId={MUX_PRODUCT_TOUR_PLAYBACK_ID}
        poster="/landing-video-poster.jpg"
        placeholder="data:image/jpeg;base64,/9j/4AAQSkZJRgABAgAAgQCAAAD//gAQTGF2YzYxLjE5LjEwMQD/2wBDAAgoKC8oLzc3Nzc3N0E8QUNDQ0FBQUFDQ0NISEhVVVVISEhDQ0hIUFBVVVxfXFdXVVdfX2RkZHh4c3OMjJGsrM//xABXAAADAQEBAAAAAAAAAAAAAAAABgUDBAcBAQEBAQAAAAAAAAAAAAAAAAACAQMQAQADAQEAAAAAAAAAAAAAAAADAgExEREBAAAAAAAAAAAAAAAAAAAAAP/AABEIABIAIAMBEgACEgADEgD/2gAMAwEAAhEDEQA/APdnPo1aXBfUS9kqdEK9N9Ro7DVINjF0YxI0a5iggSdEnWgNIuiLrQDsFiB//9k="
        loading="page"
        accentColor="#8E57DB"
        preload="metadata"
        metadata={{ video_title: "Dance-Hub product tour" }}
        nohotkeys
        className="absolute inset-0 block h-full w-full"
      />
    </div>
  );
}

// ── Features ──
const FEATURES: Array<{ label: string; title: string; body: string; Icon: typeof MessagesSquare }> = [
  {
    label: "Community",
    title: "A feed your students actually open",
    body: "Threaded posts, replies, likes, categories per topic. The relationship stays yours, not the platform's.",
    Icon: MessagesSquare,
  },
  {
    label: "Classroom",
    title: "A library your students work through",
    body: "Upload videos, organize into chapters and lessons. Progress tracked per student. Plays smoothly on any device.",
    Icon: GraduationCap,
  },
  {
    label: "Live classes",
    title: "One-button live class",
    body: "Schedule on your calendar, go live in your community. Chat, screen-share, hand-raise. No Zoom links to copy-paste.",
    Icon: Radio,
  },
  {
    label: "Private lessons",
    title: "1-on-1, paid up front",
    body: "Set your rate and availability. Students book and pay before they show up. You get a calendar event and a paid booking.",
    Icon: CalendarClock,
  },
  {
    label: "Memberships and payouts",
    title: "Up to 96% goes to you",
    body: "0% platform fees for the first 15 days. After that, fees that drop as you grow. Weekly or monthly payouts to your bank.",
    Icon: Wallet,
  },
];

function Features() {
  return (
    <section id="features" className="mx-auto max-w-[1240px] px-4 py-12 sm:px-8 sm:py-16">
      <h2 className={cn(H2, "text-center")}>
        Everything a dance teacher needs.
        <br />
        Nothing they don&apos;t.
      </h2>
      <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {FEATURES.map((f) => (
          <div key={f.label} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-5 shadow-card">
            <span aria-hidden="true" className="mb-1 grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand-ink">
              <f.Icon className="h-[22px] w-[22px]" strokeWidth={1.8} />
            </span>
            <span className={cn(LABEL, "text-[13px]")}>{f.label}</span>
            <h3 className="font-display text-[18px] font-semibold leading-[1.25] text-ink">{f.title}</h3>
            <p className="text-[14px] leading-[1.55] text-ink-2">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Before / after ──
const STACK: Array<[string, string, string]> = [
  ["Community", "WhatsApp group + Instagram DMs", "Threaded community feed"],
  ["Bookings", "Google Sheet + manual reminders", "Calendar with paid bookings"],
  ["Payments", "Bank transfer, cash, paper invoices", "Automated payouts to your bank"],
  ["Course videos", "YouTube unlisted + Google Drive", "Hosted classroom with progress"],
  ["Live classes", "Zoom link copy-pasted in four places", "One button. Goes live in your community."],
  ["Member list", "Spreadsheet that breaks each month", "Live members dashboard"],
];

function StackComparison() {
  const grid = "grid grid-cols-1 sm:grid-cols-[170px_minmax(0,1fr)_minmax(0,1fr)]";
  return (
    <section className="mx-auto max-w-[1100px] px-4 py-12 sm:px-8 sm:py-16">
      <div className="text-center">
        <p className={LABEL}>Sound familiar?</p>
        <h2 className={cn(H2, "mt-3")}>Stop juggling. Start running your floor.</h2>
        <p className={cn(LEAD, "mx-auto mt-3 max-w-[540px]")}>Replace the spreadsheets, group chats, and copy-pasted Zoom links.</p>
      </div>
      <div className="mt-9 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <div className={cn(grid, "hidden border-b border-line bg-surface-2 text-[13.5px] font-semibold sm:grid")}>
          <div className="px-5 py-3.5 text-ink-3">Function</div>
          <div className="px-5 py-3.5 text-ink-2">Today</div>
          <div className="bg-brand-soft px-5 py-3.5 text-brand-ink">With Dance-Hub</div>
        </div>
        {STACK.map(([fn, before, after]) => (
          <div key={fn} className={cn(grid, "border-t border-line first-of-type:border-t-0 sm:first-of-type:border-t")}>
            <div className="bg-surface-2 px-5 pb-1 pt-3.5 font-display text-[15px] font-semibold text-ink sm:py-4">{fn}</div>
            <div className="px-5 py-2 text-[14.5px] italic leading-[1.5] text-ink-3 sm:py-4">
              <span className="font-semibold not-italic text-ink-2 sm:hidden">Today: </span>
              {before}
            </div>
            <div className="bg-brand-soft px-5 py-2.5 text-[14.5px] font-medium leading-[1.5] text-ink sm:py-4">
              <span className="font-semibold text-brand-ink sm:hidden">With Dance-Hub: </span>
              {after}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Fees ──
const STAGES: Array<{ when: string; fee: string; sub: string; launch?: boolean }> = [
  { when: "First 15 days", fee: "0%", sub: "Keep 100% of revenue", launch: true },
  { when: "Under 50 members", fee: "8%", sub: "Once you start charging" },
  { when: "50 to 100 members", fee: "6%", sub: "Fee drops as you grow" },
  { when: "Over 100 members", fee: "4%", sub: "Lowest tier, forever" },
];

function Pricing({ onCtaSignup }: { onCtaSignup: () => void }) {
  return (
    <section id="pricing" className="mx-auto max-w-[1180px] px-4 py-12 sm:px-8 sm:py-16">
      <div className="text-center">
        <h2 className={H2}>Pay only when you charge.</h2>
        <p className={cn(LEAD, "mx-auto mt-3 max-w-[580px]")}>
          No monthly fee. 0% for your first 15 days. After that, a small share of revenue that drops as you grow.
        </p>
      </div>
      <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STAGES.map((s) => (
          <div
            key={s.when}
            className={cn(
              "relative flex flex-col gap-2 rounded-2xl p-5 sm:p-6",
              s.launch ? "bg-brand text-white shadow-raised" : "border border-line bg-surface shadow-card"
            )}
          >
            {s.launch && (
              <span className="absolute right-3.5 top-3.5 rounded-full bg-white/20 px-2 py-0.5 text-[12px] font-semibold text-white">Launch</span>
            )}
            <span className={cn("text-[13.5px] font-semibold", s.launch ? "text-white/85" : "text-ink-2")}>{s.when}</span>
            <span className="font-display text-[46px] font-semibold leading-none tracking-[-0.03em] tabular-nums sm:text-[54px]">{s.fee}</span>
            <span className={cn("text-[13.5px] leading-[1.4]", s.launch ? "text-white/90" : "text-ink-2")}>{s.sub}</span>
          </div>
        ))}
      </div>
      <div className="mt-9 text-center">
        <StartButton onClick={onCtaSignup} />
      </div>
    </section>
  );
}

// ── FAQ ──
const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What if my followers won't pay? They only follow me because it's free.",
    a: "The question every teacher asks. Reality: a small fraction of any real audience will pay if the offer is right. One early teacher on Dance-Hub turned 23 of her followers into paying students at €25 per month. You don't need most of your audience to convert. You need a few. The first 15 days are 0% platform fees, so you can find out with no downside.",
  },
  {
    q: "How is Dance-Hub different from Skool, Patreon or Discord?",
    a: "Skool is built for online business courses. Patreon for podcasters and artists who want a tip jar. Discord is a chat app. Dance-Hub is one place that does what dance teachers actually need: a feed for the community, a classroom for your courses, live classes, paid 1-on-1 lessons, and the membership and payout machinery underneath all of it. No bolting five tools together.",
  },
  {
    q: "What does it cost to start?",
    a: "Nothing. Run your community with 0% platform fees for the first 15 days. After that we take a share of revenue that drops as you grow: 8% under 50 members, 6% to 100, 4% above. No setup fee, no monthly seat fee.",
  },
  {
    q: "Can my international students pay?",
    a: "Yes. Students can pay in their local currency from most countries. You get paid out to your bank wherever you're based.",
  },
  {
    q: "Can I import my videos to the Classroom?",
    a: "Yes. Drag-and-drop upload to any chapter. We host and transcode for you, so the same file plays smoothly on phones, tablets, and laptops without you thinking about formats.",
  },
  {
    q: "When do I get paid?",
    a: "On your schedule. Pick daily, weekly, or monthly payouts and the money lands in your bank automatically.",
  },
  {
    q: "Does it work on mobile?",
    a: "Yes. Dance-Hub is fully responsive. Your community, classroom, live classes and 1-on-1 video sessions work in any modern mobile browser.",
  },
  {
    q: "Do I need to be technical to set this up?",
    a: "No. If you can post on Instagram, you can run a Dance-Hub community. Pick a name, drop in your courses or schedule, connect your payment account, share the link. The whole setup takes about five minutes.",
  },
  {
    q: "Are there any limits as my community grows?",
    a: "No member cap, no course cap, no thread cap. Hosted video and live classes scale with you.",
  },
  {
    q: "I have a question that isn't here.",
    a: "Email hello@dance-hub.io. It goes to a real person on the team. We try to reply within a working day.",
  },
];

function FAQ() {
  return (
    <section id="faq" className="mx-auto max-w-[880px] px-4 py-12 sm:px-8 sm:py-16">
      <h2 className={cn(H2, "text-center")}>Questions teachers ask before signing up</h2>
      <div className="mt-10 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        {FAQS.map((f, i) => (
          <details key={f.q} open={i === 0} className="group">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-5 py-[18px] font-display text-[17px] font-semibold leading-[1.35] text-ink transition-colors hover:bg-surface-2 sm:px-6 sm:text-[18px] [&::-webkit-details-marker]:hidden">
              {f.q}
              <ChevronDown className="mt-1 h-[18px] w-[18px] shrink-0 text-ink-3 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <p className="max-w-[68ch] px-5 pb-5 text-[15.5px] leading-[1.65] text-ink-2 sm:px-6">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

// ── Founder note ──
function FounderLetter() {
  return (
    <section className="my-10 bg-surface-2 py-16 sm:my-14 sm:py-24">
      <div className="mx-auto grid max-w-[1100px] grid-cols-1 items-center gap-10 px-4 sm:px-8 lg:grid-cols-[1.2fr_1fr] lg:gap-14">
        <div>
          <p className={LABEL}>A note from the founder</p>
          <h2 className={cn(H2, "mt-3 sm:text-[38px]")}>
            Most dance teachers I know have huge audiences <span className="text-brand">and tiny incomes.</span>
          </h2>
          <div className="mt-6 flex flex-col gap-3.5 text-[16px] leading-[1.7] text-ink-2">
            <p>Hey, I&apos;m Logan.</p>
            <p>
              I kept seeing the same pattern. Dance teachers with thousands of followers on Instagram, posting tutorials every week, getting real
              people genuinely better at dancing. And almost none of them earning a living from teaching alone.
            </p>
            <p>
              The audience is there. The willingness to pay is there. What&apos;s missing is the bridge from &quot;I love your tutorials&quot; to
              &quot;I&apos;m your student.&quot; That&apos;s what Dance-Hub is for.
            </p>
            <p>
              One of the first teachers I worked with has 23 paying students at €25 a month. Around €500 to €600 in recurring monthly revenue, from
              the same Instagram audience that was paying her nothing the month before. That&apos;s the gap I wanted to close.
            </p>
          </div>
        </div>
        <img
          src="/founder-logan.png"
          alt="Logan, founder of Dance-Hub"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
          className="h-[360px] w-full rounded-[20px] object-cover shadow-raised sm:h-[420px]"
        />
      </div>
    </section>
  );
}

// ── Final call to action ──
function FinalCTA({ onCtaSignup }: { onCtaSignup: () => void }) {
  return (
    <section className="mx-auto max-w-[1240px] px-4 pb-14 sm:px-8 sm:pb-20">
      <div className="rounded-[28px] bg-brand px-6 py-14 text-center text-white sm:px-14 sm:py-20">
        <h2 className="text-balance font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[52px]">
          Turn your followers into students.
        </h2>
        <p className="mx-auto mt-4 max-w-[480px] text-[17px] leading-[1.55] text-white/85">Set up your community in five minutes.</p>
        <button
          type="button"
          onClick={onCtaSignup}
          className="mt-8 inline-flex h-12 items-center gap-2 rounded-[10px] bg-white px-6 text-[16px] font-semibold text-brand-ink shadow-raised transition-[transform,background-color] hover:-translate-y-px hover:bg-white/95"
        >
          Start your community
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

function FooterBlock() {
  return (
    <footer className="bg-ink px-4 py-7 text-[13px] text-white/70 sm:px-8">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3">
        <div>© {new Date().getFullYear()} Dance-Hub. Built in Estonia 🇪🇪</div>
        <div className="flex gap-5">
          <Link href="/privacy" className="hover:text-white">
            Privacy policy
          </Link>
          <Link href="/terms" className="hover:text-white">
            Terms of service
          </Link>
        </div>
      </div>
    </footer>
  );
}

// ── Page ──
export default function HomePageClient() {
  const { user } = useAuth();
  const { showAuthModal } = useAuthModal();
  const promptedRef = useRef(false);

  // /onboarding sends signed-out visitors here with ?auth=signup, and the
  // admin page guards with ?auth=login, so the modal opens over the landing
  // page rather than on an empty page of its own. ?redirect= is only followed
  // when it is a same-origin path.
  useEffect(() => {
    if (promptedRef.current) return;
    const request = authModalRequestFromSearch(window.location.search);
    if (!request) return;
    promptedRef.current = true;
    showAuthModal(request.tab, request.redirect);
    window.history.replaceState({}, "", window.location.pathname);
  }, [showAuthModal]);

  const onCtaSignup = () => {
    if (user) {
      window.location.href = "/onboarding";
    } else {
      showAuthModal("signup", "/onboarding");
    }
  };

  return (
    <div className="overflow-x-hidden bg-canvas font-sans text-ink">
      {/* Mux's lazy player paints three layers that show as dark edges at the
          rounded corners (black background, letterboxed placeholder, a dimming
          overlay). Clear all three so the poster shows edge to edge.
          dangerouslySetInnerHTML so React doesn't escape the CSS. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        mux-player { --media-background-color: transparent; --media-object-fit: cover; }
        mux-player [data-mux-player-react-lazy-placeholder-overlay] { background-color: transparent !important; }
      `,
        }}
      />
      <Hero onCtaSignup={onCtaSignup} />
      <Features />
      <StackComparison />
      <Pricing onCtaSignup={onCtaSignup} />
      <FAQ />
      <FounderLetter />
      <FinalCTA onCtaSignup={onCtaSignup} />
      <FooterBlock />
    </div>
  );
}
