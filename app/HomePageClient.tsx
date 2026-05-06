"use client";

import Link from "next/link";
import { CSSProperties } from "react";
import {
  ArrowRight,
  MessagesSquare,
  GraduationCap,
  Radio,
  CalendarClock,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";

// Lavender token chassis from V4 design.
const LT = {
  bg: "hsl(270, 60%, 97%)",
  bgDeep: "hsl(270, 50%, 93%)",
  card: "hsl(270, 60%, 99%)",
  fg: "hsl(270, 30%, 18%)",
  fgSoft: "hsl(270, 25%, 30%)",
  muted: "hsl(270, 18%, 48%)",
  border: "hsl(270, 40%, 88%)",
  rule: "hsl(270, 40%, 93%)",
  primary: "hsl(265, 65%, 55%)",
  primaryDeep: "hsl(265, 70%, 32%)",
  primarySoft: "hsl(265, 65%, 95%)",
  secondary: "hsl(275, 55%, 70%)",
  accent: "hsl(300, 60%, 60%)",
  gold: "hsl(38, 85%, 60%)",
  coral: "hsl(10, 75%, 62%)",
  ink: "hsl(270, 30%, 10%)",
};

// Stick to fonts already wired into app/layout.tsx — Outfit (display), Figtree (body),
// Geist Mono (mono). The italic accent uses Outfit's own italic to avoid a second
// font-load just for two phrases.
const FONT_DISPLAY = "var(--font-outfit), system-ui, sans-serif";
const FONT_BODY = "var(--font-figtree), system-ui, sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const FONT_ITALIC = "var(--font-outfit), system-ui, sans-serif";

// ── Logo mark ──
function DHMark({ size = 28, color }: { size?: number; color?: string }) {
  const c = color || LT.primary;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="15" fill={c} />
      <path
        d="M10 8 L10 24 M10 8 Q18 8 18 16 Q18 24 10 24 M22 12 L22 20"
        stroke="white"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

type PhotoTone = "lavender" | "deep" | "warm" | "ink" | "gold";
function PhotoPlaceholder({
  label,
  h = 200,
  radius = 14,
  tone = "lavender",
  style = {},
}: {
  label: string;
  h?: number;
  radius?: number;
  tone?: PhotoTone;
  style?: CSSProperties;
}) {
  const tones: Record<PhotoTone, { a: string; b: string; ink: string }> = {
    lavender: { a: "hsl(270, 40%, 88%)", b: "hsl(270, 30%, 82%)", ink: "hsl(270, 30%, 38%)" },
    deep: { a: "hsl(265, 55%, 35%)", b: "hsl(265, 50%, 28%)", ink: "hsl(265, 40%, 85%)" },
    warm: { a: "hsl(20, 55%, 82%)", b: "hsl(20, 45%, 75%)", ink: "hsl(20, 40%, 30%)" },
    ink: { a: "hsl(270, 20%, 14%)", b: "hsl(270, 20%, 10%)", ink: "hsl(270, 15%, 70%)" },
    gold: { a: "hsl(38, 60%, 80%)", b: "hsl(38, 55%, 70%)", ink: "hsl(38, 60%, 25%)" },
  };
  const t = tones[tone];
  return (
    <div
      style={{
        width: "100%",
        height: h,
        borderRadius: radius,
        overflow: "hidden",
        background: `repeating-linear-gradient(135deg, ${t.a} 0 14px, ${t.b} 14px 28px)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT_MONO,
        fontSize: 11,
        color: t.ink,
        letterSpacing: 1,
        textTransform: "uppercase",
        position: "relative",
        ...style,
      }}
    >
      <span style={{ background: "rgba(255,255,255,0.3)", padding: "3px 8px", borderRadius: 4 }}>
        {label}
      </span>
    </div>
  );
}

// ── 3. Hero ──
function Hero({ onCtaSignup }: { onCtaSignup: () => void }) {
  return (
    <section
      style={{ maxWidth: 1240, margin: "0 auto", padding: "36px 32px 28px", textAlign: "center" }}
      className="lp-hero"
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 14px",
          borderRadius: 999,
          background: LT.primarySoft,
          color: LT.primaryDeep,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 0.4,
          marginBottom: 28,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: LT.primary }} />
        Made for dance teachers
      </div>
      <h1
        className="lp-h1"
        style={{
          fontFamily: FONT_BODY,
          fontSize: 76,
          fontWeight: 700,
          letterSpacing: -2.8,
          lineHeight: 1.0,
          margin: "0 auto 22px",
          maxWidth: 1000,
        }}
      >
        Turn your followers
        <br />
        into{" "}
        <span
          style={{
            color: LT.primary,
            background: `linear-gradient(180deg, transparent 62%, ${LT.primarySoft} 62%)`,
            padding: "0 6px",
          }}
        >
          paying students.
        </span>
      </h1>
      <p
        style={{
          fontSize: 18,
          lineHeight: 1.55,
          color: LT.fgSoft,
          maxWidth: 720,
          margin: "0 auto 36px",
        }}
      >
        Build a paid community from the audience you already have. Courses, live classes, and 1-on-1 lessons in one place.
      </p>
      <div
        className="lp-cta-row"
        style={{ display: "flex", justifyContent: "center", alignItems: "center", marginBottom: 22 }}
      >
        <button
          onClick={onCtaSignup}
          className="lp-hero-cta"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "16px 28px",
            borderRadius: 12,
            border: "none",
            background: LT.primary,
            color: "white",
            fontWeight: 700,
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          Start your community
          <ArrowRight size={20} />
        </button>
      </div>
      <div style={{ fontSize: 13, color: LT.muted, marginBottom: 50 }}>
        0% platform fees for the first 30 days. Live in 5 minutes.
      </div>

      <HeroImage />
    </section>
  );
}

// ── Hero product mockup ──
function HeroImage() {
  return (
    <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto" }} className="lp-hero-img">
      <svg
        viewBox="0 0 1200 80"
        style={{
          position: "absolute",
          top: -36,
          left: 0,
          width: "100%",
          height: 60,
          opacity: 0.45,
        }}
        aria-hidden
      >
        <path
          d="M0 40 Q 150 0 300 40 T 600 40 T 900 40 T 1200 40"
          stroke={LT.primary}
          strokeWidth="3"
          fill="none"
        />
        <path
          d="M0 50 Q 150 10 300 50 T 600 50 T 900 50 T 1200 50"
          stroke={LT.accent}
          strokeWidth="2"
          fill="none"
          opacity="0.6"
        />
      </svg>

      <div
        style={{
          borderRadius: 22,
          overflow: "hidden",
          position: "relative",
          background: LT.card,
          border: `1px solid ${LT.border}`,
          boxShadow:
            "0 40px 80px -30px rgba(60,30,100,0.35), 0 8px 16px -4px rgba(60,30,100,0.08)",
        }}
      >
        <div
          style={{
            padding: "12px 18px",
            borderBottom: `1px solid ${LT.rule}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: LT.bg,
          }}
        >
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#ff5f57" }} />
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#febc2e" }} />
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#28c840" }} />
          <span
            style={{
              marginLeft: 16,
              fontSize: 12,
              color: LT.muted,
              fontFamily: FONT_MONO,
            }}
          >
            dance-hub.io/bachataflow
          </span>
        </div>

        <img
          src="/hero-community.png"
          alt="BachataFlow community on Dance-Hub"
          style={{
            display: "block",
            width: "100%",
            height: "auto",
          }}
        />
      </div>
    </div>
  );
}

// ── 4. "Decoded" video band ──
function DecodedBand() {
  return (
    <section
      style={{
        maxWidth: 1240,
        margin: "60px auto 20px",
        padding: "0 32px",
        textAlign: "center",
      }}
      className="lp-decoded"
    >
      <h2
        className="lp-h2"
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 38,
          fontWeight: 600,
          letterSpacing: -1.2,
          lineHeight: 1.15,
          margin: "0 auto 32px",
          maxWidth: 820,
        }}
      >
        Built ground-up for dance teachers.
      </h2>
      <div
        style={{
          position: "relative",
          maxWidth: 880,
          margin: "0 auto",
          borderRadius: 18,
          overflow: "hidden",
          aspectRatio: "16/9",
          background: `linear-gradient(135deg, hsl(270, 30%, 18%), hsl(265, 50%, 28%))`,
          boxShadow: "0 30px 60px -20px rgba(60,30,100,0.4)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.18,
            background: `repeating-linear-gradient(135deg, transparent 0 18px, white 18px 19px)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 22,
            left: 26,
            color: "white",
            fontFamily: FONT_MONO,
            fontSize: 12,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            opacity: 0.8,
          }}
        >
          02:14 · Product tour
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: "50%",
              background: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 14px 30px rgba(0,0,0,0.3)",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: 0,
                height: 0,
                marginLeft: 6,
                borderLeft: `22px solid ${LT.primary}`,
                borderTop: "14px solid transparent",
                borderBottom: "14px solid transparent",
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 5. Feature cards ──
type FeatureCard = {
  label: string;
  title: string;
  body: string;
  Icon: typeof MessagesSquare;
};

const FEATURES: FeatureCard[] = [
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
    label: "Memberships & payouts",
    title: "Up to 96% goes to you",
    body: "0% platform fees for the first 30 days. After that, fees that drop as you grow. Weekly or monthly payouts to your bank.",
    Icon: Wallet,
  },
];

function FeatureRows() {
  return (
    <section
      id="features"
      style={{ maxWidth: 1240, margin: "60px auto", padding: "0 32px" }}
      className="lp-features"
    >
      <div style={{ textAlign: "center", marginBottom: 44 }}>
        <h2
          className="lp-h2"
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 44,
            fontWeight: 600,
            letterSpacing: -1.4,
            lineHeight: 1.05,
            margin: 0,
          }}
        >
          Everything a dance teacher needs.
          <br />
          Nothing they don&apos;t.
        </h2>
      </div>

      <div
        className="lp-features-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 16,
        }}
      >
        {FEATURES.map((f, i) => (
          <div
            key={i}
            style={{
              background: LT.card,
              border: `1px solid ${LT.border}`,
              borderRadius: 16,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 12,
                background: LT.primarySoft,
                color: LT.primary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 4,
              }}
            >
              <f.Icon size={26} strokeWidth={1.8} />
            </div>
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 10,
                letterSpacing: 2.5,
                textTransform: "uppercase",
                color: LT.primary,
                fontWeight: 700,
              }}
            >
              {f.label}
            </div>
            <h3
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: -0.5,
                lineHeight: 1.2,
                margin: 0,
                color: LT.fg,
              }}
            >
              {f.title}
            </h3>
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.55,
                color: LT.fgSoft,
                margin: 0,
              }}
            >
              {f.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── 6. DIY-stack comparison (the "before / after" framing) ──
function StackComparison() {
  const rows: Array<[string, string, string]> = [
    ["Community", "WhatsApp group + Instagram DMs", "Threaded community feed"],
    ["Bookings", "Google Sheet + manual reminders", "Calendar with paid bookings"],
    ["Payments", "Bank transfer, cash, paper invoices", "Automated payouts to your bank"],
    ["Course videos", "YouTube unlisted + Google Drive", "Hosted classroom with progress"],
    ["Live classes", "Zoom link copy-pasted in four places", "One button. Goes live in your community."],
    ["Member list", "Spreadsheet that breaks each month", "Live members dashboard"],
  ];
  return (
    <section
      style={{ maxWidth: 1100, margin: "30px auto 60px", padding: "0 32px" }}
    >
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: LT.primary,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          Sound familiar?
        </div>
        <h2
          className="lp-h2"
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 44,
            fontWeight: 600,
            letterSpacing: -1.4,
            lineHeight: 1.05,
            margin: "0 0 12px",
          }}
        >
          Stop juggling. Start running your floor.
        </h2>
        <p style={{ fontSize: 16, color: LT.fgSoft, maxWidth: 540, margin: "0 auto" }}>
          Replace the spreadsheets, group chats, and copy-pasted Zoom links.
        </p>
      </div>
      <div
        style={{
          background: LT.card,
          border: `1px solid ${LT.border}`,
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 8px 24px -16px rgba(60,30,100,0.1)",
        }}
      >
        <div
          className="lp-stack-header"
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr 1fr",
            background: LT.bg,
            borderBottom: `1px solid ${LT.rule}`,
            fontFamily: FONT_DISPLAY,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <div style={{ padding: "16px 22px", color: LT.muted }}>Function</div>
          <div style={{ padding: "16px 22px", color: LT.fgSoft }}>Today</div>
          <div
            style={{
              padding: "16px 22px",
              color: LT.primary,
              background: LT.primarySoft,
              fontWeight: 700,
            }}
          >
            With Dance-Hub
          </div>
        </div>
        {rows.map(([fn, before, after], i) => (
          <div
            key={i}
            className="lp-stack-row"
            style={{
              display: "grid",
              gridTemplateColumns: "180px 1fr 1fr",
              borderTop: i === 0 ? "none" : `1px solid ${LT.rule}`,
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                padding: "18px 22px",
                fontFamily: FONT_DISPLAY,
                fontSize: 14,
                fontWeight: 700,
                color: LT.fg,
                background: LT.bg,
              }}
            >
              {fn}
            </div>
            <div
              style={{
                padding: "18px 22px",
                fontSize: 14,
                lineHeight: 1.5,
                color: LT.muted,
                fontStyle: "italic",
              }}
            >
              {before}
            </div>
            <div
              style={{
                padding: "18px 22px",
                fontSize: 14,
                lineHeight: 1.5,
                color: LT.fg,
                background: LT.primarySoft,
                fontWeight: 500,
              }}
            >
              {after}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}


// ── 7. Pricing (fee scale) ──
function Pricing({ onCtaSignup }: { onCtaSignup: () => void }) {
  const stages: Array<{ when: string; fee: string; sub: string; launch?: boolean }> = [
    { when: "First 30 days", fee: "0%", sub: "Keep 100% of revenue", launch: true },
    { when: "Under 50 members", fee: "8%", sub: "Once you start charging" },
    { when: "50 to 100 members", fee: "6%", sub: "Fee drops as you grow" },
    { when: "Over 100 members", fee: "4%", sub: "Lowest tier, forever" },
  ];
  return (
    <section
      id="pricing"
      style={{ maxWidth: 1180, margin: "80px auto 60px", padding: "0 32px" }}
    >
      <div style={{ textAlign: "center", marginBottom: 44 }}>
        <h2
          className="lp-h2"
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 44,
            fontWeight: 600,
            letterSpacing: -1.4,
            lineHeight: 1.05,
            margin: "0 0 12px",
          }}
        >
          Pay only when you charge.
        </h2>
        <p style={{ fontSize: 16, color: LT.fgSoft, maxWidth: 580, margin: "0 auto" }}>
          No monthly fee. 0% for your first 30 days. After that, a small share of revenue that
          drops as you grow.
        </p>
      </div>
      <div
        className="lp-fee-scale"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
        }}
      >
        {stages.map((s, i) => (
          <div
            key={i}
            style={{
              background: s.launch ? LT.primary : LT.card,
              color: s.launch ? "white" : LT.fg,
              border: s.launch ? "none" : `1px solid ${LT.border}`,
              borderRadius: 16,
              padding: "26px 22px 24px",
              position: "relative",
              boxShadow: s.launch
                ? `0 18px 40px -16px ${LT.primary}`
                : "0 4px 14px -10px rgba(60,30,100,0.08)",
            }}
          >
            {s.launch && (
              <div
                style={{
                  position: "absolute",
                  top: 14,
                  right: 14,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: LT.gold,
                  color: LT.ink,
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                Launch
              </div>
            )}
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 11,
                letterSpacing: 2,
                textTransform: "uppercase",
                opacity: s.launch ? 0.85 : 0.6,
                marginBottom: 14,
                fontWeight: 700,
              }}
            >
              {s.when}
            </div>
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 56,
                fontWeight: 700,
                letterSpacing: -2,
                lineHeight: 1,
                marginBottom: 10,
              }}
            >
              {s.fee}
            </div>
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.4,
                opacity: s.launch ? 0.92 : 1,
                color: s.launch ? "white" : LT.fgSoft,
              }}
            >
              {s.sub}
            </div>
          </div>
        ))}
      </div>
      <div style={{ textAlign: "center", marginTop: 32 }}>
        <button
          onClick={onCtaSignup}
          className="lp-hero-cta"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "16px 28px",
            borderRadius: 12,
            border: "none",
            background: LT.primary,
            color: "white",
            fontWeight: 700,
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          Start your community
          <ArrowRight size={20} />
        </button>
      </div>
    </section>
  );
}

// ── 8. FAQ ──
const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What if my followers won't pay? They only follow me because it's free.",
    a: "The question every teacher asks. Reality: a small fraction of any real audience will pay if the offer is right. One early teacher on Dance-Hub turned 23 of her followers into paying students at €25 per month. You don't need most of your audience to convert. You need a few. The first 30 days are 0% platform fees, so you can find out with no downside.",
  },
  {
    q: "How is Dance-Hub different from Skool, Patreon or Discord?",
    a: "Skool is built for online business courses. Patreon for podcasters and artists who want a tip jar. Discord is a chat app. Dance-Hub is one place that does what dance teachers actually need: a feed for the community, a classroom for your courses, live classes, paid 1-on-1 lessons, and the membership and payout machinery underneath all of it. No bolting five tools together.",
  },
  {
    q: "What does it cost to start?",
    a: "Nothing. Run your community with 0% platform fees for the first 30 days. After that we take a share of revenue that drops as you grow: 8% under 50 members, 6% to 100, 4% above. No setup fee, no monthly seat fee.",
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
    <section
      id="faq"
      style={{ maxWidth: 920, margin: "60px auto", padding: "0 32px" }}
      className="lp-faq"
    >
      <div style={{ textAlign: "center", marginBottom: 50 }}>
        <h2
          className="lp-h2"
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 44,
            fontWeight: 600,
            letterSpacing: -1.4,
            lineHeight: 1,
            margin: 0,
          }}
        >
          Questions teachers ask before signing up
        </h2>
      </div>
      <div style={{ borderTop: `1px solid ${LT.border}` }}>
        {FAQS.map((f, i) => (
          <details
            key={i}
            style={{ borderBottom: `1px solid ${LT.border}`, padding: "22px 4px" }}
            open={i === 0}
          >
            <summary
              style={{
                cursor: "pointer",
                listStyle: "none",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 24,
                fontFamily: FONT_DISPLAY,
                fontSize: 19,
                fontWeight: 600,
                letterSpacing: -0.4,
                lineHeight: 1.3,
                color: LT.fg,
              }}
            >
              {f.q}
              <span
                style={{
                  flexShrink: 0,
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: LT.primarySoft,
                  color: LT.primary,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                +
              </span>
            </summary>
            <div
              style={{
                fontSize: 15,
                lineHeight: 1.65,
                color: LT.fgSoft,
                marginTop: 14,
                maxWidth: 760,
              }}
            >
              {f.a}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

// ── 9. Founder note ──
function FounderLetter() {
  return (
    <section style={{ background: LT.bgDeep, padding: "90px 0", margin: "60px 0" }}>
      <div
        className="lp-letter"
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "0 32px",
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: 56,
          alignItems: "center",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: LT.primary,
              marginBottom: 14,
              fontWeight: 600,
            }}
          >
            ─── A note from the founder
          </div>
          <h2
            className="lp-h2"
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 38,
              fontWeight: 600,
              letterSpacing: -1.2,
              lineHeight: 1.1,
              margin: "0 0 24px",
            }}
          >
            Most dance teachers I know have huge audiences{" "}
            <span
              style={{
                color: LT.primary,
                fontStyle: "italic",
                fontFamily: FONT_ITALIC,
                fontWeight: 400,
              }}
            >
              and tiny incomes.
            </span>
          </h2>
          <div style={{ fontSize: 16, lineHeight: 1.7, color: LT.fgSoft, marginBottom: 24 }}>
            <p style={{ margin: "0 0 14px" }}>Hey, I&apos;m Logan.</p>
            <p style={{ margin: "0 0 14px" }}>
              I kept seeing the same pattern. Dance teachers with thousands of followers on
              Instagram, posting tutorials every week, getting real people genuinely better at
              dancing. And almost none of them earning a living from teaching alone.
            </p>
            <p style={{ margin: "0 0 14px" }}>
              The audience is there. The willingness to pay is there. What&apos;s missing is the
              bridge from &quot;I love your tutorials&quot; to &quot;I&apos;m your student.&quot;
              That&apos;s what Dance-Hub is for.
            </p>
            <p style={{ margin: "0 0 18px" }}>
              One of the first teachers I worked with has 23 paying students at €25 a month.
              Around €500 to €600 in recurring monthly revenue, from the same Instagram audience
              that was paying her nothing the month before. That&apos;s the gap I wanted to close.
            </p>
          </div>
        </div>
        <div>
          {/* Drop /public/founder-logan.png and the placeholder will swap to a real photo. */}
          <img
            src="/founder-logan.png"
            alt="Logan, founder of Dance-Hub"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
              const sibling = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
              if (sibling) sibling.style.display = "flex";
            }}
            style={{
              width: "100%",
              height: 420,
              objectFit: "cover",
              borderRadius: 18,
              boxShadow: "0 30px 60px -25px rgba(60,30,100,0.3)",
            }}
          />
          <div style={{ display: "none" }}>
            <PhotoPlaceholder label="logan · founder · drop /public/founder-logan.jpg" h={420} radius={18} tone="warm" />
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 10. Final CTA ──
function FinalCTA({ onCtaSignup }: { onCtaSignup: () => void }) {
  return (
    <section style={{ maxWidth: 1240, margin: "60px auto", padding: "0 32px" }}>
      <div
        className="lp-final"
        style={{
          borderRadius: 28,
          padding: "80px 56px",
          background: `linear-gradient(135deg, ${LT.primary} 0%, ${LT.primaryDeep} 70%, ${LT.ink} 100%)`,
          color: "white",
          position: "relative",
          overflow: "hidden",
          textAlign: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.18), transparent 55%)",
          }}
        />
        <div style={{ position: "relative" }}>
          <h2
            className="lp-h2"
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 56,
              fontWeight: 600,
              letterSpacing: -2,
              lineHeight: 1.0,
              margin: "0 0 18px",
            }}
          >
            Turn your followers into students.
          </h2>
          <p
            style={{
              fontSize: 18,
              opacity: 0.88,
              maxWidth: 480,
              margin: "0 auto 30px",
              lineHeight: 1.55,
            }}
          >
            Set up your community in five minutes.
          </p>
          <button
            onClick={onCtaSignup}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "16px 28px",
              borderRadius: 12,
              border: "none",
              background: "white",
              color: LT.primaryDeep,
              fontWeight: 700,
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            Start your community
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
    </section>
  );
}

// ── 11. Footer ──
function FooterBlock() {
  return (
    <footer
      style={{
        background: LT.ink,
        color: "rgba(255,255,255,0.7)",
        padding: "28px 32px",
      }}
    >
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 13,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>© {new Date().getFullYear()} Dance-Hub · Built in Estonia 🇪🇪</div>
        <div style={{ display: "flex", gap: 22 }}>
          <Link
            href="/privacy"
            style={{ color: "inherit", textDecoration: "none" }}
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            style={{ color: "inherit", textDecoration: "none" }}
          >
            Terms of Service
          </Link>
        </div>
      </div>
    </footer>
  );
}

// ── Page assembly ──
export default function HomePageClient() {
  const { user } = useAuth();
  const { showAuthModal } = useAuthModal();
  const onCtaSignup = () => {
    if (user) {
      window.location.href = "/onboarding";
    } else {
      showAuthModal("signup", "/onboarding");
    }
  };

  return (
    <div
      style={{
        background: LT.bg,
        color: LT.fg,
        fontFamily: FONT_BODY,
        overflowX: "hidden",
      }}
    >
      {/* Responsive overrides. dangerouslySetInnerHTML so React doesn't escape `>` in CSS selectors and produce a hydration mismatch. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .lp-h1 { font-size: 76px; }
        .lp-h2 { font-size: 48px; }
        .lp-hero-cta {
          transition: transform 200ms ease, box-shadow 200ms ease, filter 200ms ease;
          box-shadow: 0 10px 26px -10px hsla(265, 65%, 55%, 0.55);
        }
        .lp-hero-cta:hover {
          transform: scale(1.05);
          box-shadow: 0 14px 32px -8px hsla(265, 65%, 55%, 0.7);
          filter: brightness(1.08);
        }
        @media (max-width: 1240px) {
          .lp-features-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 1080px) {
          .lp-hero-app { grid-template-columns: 1fr !important; }
          .lp-hero-side, .lp-hero-rail { display: none !important; }
          .lp-foot-grid { grid-template-columns: 1.4fr 1fr 1fr !important; }
        }
        @media (max-width: 820px) {
          .lp-h1 { font-size: 44px !important; letter-spacing: -1.4px !important; }
          .lp-h2 { font-size: 30px !important; letter-spacing: -1px !important; }
          .lp-nav-links { display: none !important; }
          .lp-features-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .lp-stack-header, .lp-stack-row { grid-template-columns: 1fr !important; }
          .lp-stack-header > div, .lp-stack-row > div { padding: 12px 18px !important; }
          .lp-band { grid-template-columns: 1fr !important; padding: 36px 28px !important; }
          .lp-fee-scale { grid-template-columns: repeat(2, 1fr) !important; }
          .lp-final { grid-template-columns: 1fr !important; padding: 48px 28px !important; }
          .lp-letter { grid-template-columns: 1fr !important; }
          .lp-stats { grid-template-columns: repeat(2, 1fr) !important; gap: 24px 0 !important; }
          .lp-stats > div:nth-child(3) { border-left: none !important; }
          .lp-foot-grid { grid-template-columns: 1fr 1fr !important; }
          .lp-promo { font-size: 11px !important; padding: 8px 12px !important; }
          .lp-decoded h2.lp-h2, .lp-decoded h2 { font-size: 26px !important; }
        }
        @media (max-width: 560px) {
          .lp-features-grid { grid-template-columns: 1fr !important; }
        }
      `,
        }}
      />

      <Hero onCtaSignup={onCtaSignup} />
      <DecodedBand />
      <FeatureRows />
      <StackComparison />
      <Pricing onCtaSignup={onCtaSignup} />
      <FAQ />
      <FounderLetter />
      <FinalCTA onCtaSignup={onCtaSignup} />
      <FooterBlock />
    </div>
  );
}
