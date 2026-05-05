"use client";

import Link from "next/link";
import { CSSProperties, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";

// ViewStats-shaped landing — explicitly mimicking that page's anatomy:
//   centered hero with a mosaic of thumbnails behind it →
//   dark video band →
//   single-row of small "tools" cards →
//   FULL-BLEED RED claim panel (white text, ranked list on the right) →
//   community-connect band (dark image left / text right) →
//   "your next X should go viral" CTA + 2-card pricing →
//   FAQ →
//   FULL-BLEED RED founder block →
//   dark final-CTA with 3 phone mockups in a row →
//   footer.
const T = {
  bg: "hsl(0, 0%, 99%)",
  card: "hsl(0, 0%, 100%)",
  fg: "hsl(0, 0%, 10%)",
  fgSoft: "hsl(0, 0%, 30%)",
  muted: "hsl(0, 0%, 50%)",
  border: "hsl(0, 0%, 90%)",
  rule: "hsl(0, 0%, 94%)",
  red: "hsl(2, 82%, 52%)",
  redDeep: "hsl(2, 80%, 42%)",
  redSoft: "hsl(2, 90%, 96%)",
  ink: "hsl(0, 0%, 6%)",
  inkSoft: "hsl(0, 0%, 14%)",
};

const FONT_DISPLAY = "var(--font-outfit), system-ui, sans-serif";
const FONT_BODY = "var(--font-figtree), system-ui, sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

type Tone = "warm" | "deep" | "ink" | "light" | "red";
function Mock({
  label,
  h = 200,
  radius = 14,
  tone = "warm",
  style = {},
}: {
  label: string;
  h?: number | string;
  radius?: number;
  tone?: Tone;
  style?: CSSProperties;
}) {
  const tones: Record<Tone, { a: string; b: string; ink: string }> = {
    warm: { a: "hsl(22, 60%, 88%)", b: "hsl(22, 50%, 80%)", ink: "hsl(22, 50%, 28%)" },
    deep: { a: "hsl(0, 0%, 22%)", b: "hsl(0, 0%, 14%)", ink: "hsl(0, 0%, 80%)" },
    ink: { a: "hsl(0, 0%, 14%)", b: "hsl(0, 0%, 8%)", ink: "hsl(0, 0%, 70%)" },
    light: { a: "hsl(0, 0%, 92%)", b: "hsl(0, 0%, 86%)", ink: "hsl(0, 0%, 38%)" },
    red: { a: "hsl(2, 70%, 60%)", b: "hsl(2, 65%, 50%)", ink: "hsl(2, 30%, 92%)" },
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
        fontSize: 10,
        color: t.ink,
        letterSpacing: 1,
        textTransform: "uppercase",
        position: "relative",
        ...style,
      }}
    >
      <span style={{ background: "rgba(255,255,255,0.35)", padding: "3px 8px", borderRadius: 4 }}>
        {label}
      </span>
    </div>
  );
}

function DHMark({ size = 28, color }: { size?: number; color?: string }) {
  const c = color || T.red;
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

function Kicker({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <div
      style={{
        fontFamily: FONT_MONO,
        fontSize: 11,
        letterSpacing: 3,
        textTransform: "uppercase",
        color: color || T.red,
        fontWeight: 700,
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

// ── Tight nav (ViewStats has a minimal one) ──
function Nav({ user }: { user: unknown }) {
  const isAuthed = !!user;
  return (
    <nav
      className="lp-nav"
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "20px 32px",
        display: "flex",
        alignItems: "center",
      }}
    >
      <Link
        href="/"
        style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: T.fg }}
      >
        <DHMark size={28} />
        <span
          style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 800, letterSpacing: -0.4 }}
        >
          Dance-Hub
        </span>
      </Link>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 22 }}>
        <Link
          href="/discovery"
          className="lp-nav-link"
          style={{ fontSize: 14, color: T.fgSoft, textDecoration: "none", fontWeight: 500 }}
        >
          Discover
        </Link>
        {isAuthed ? (
          <Link
            href="/onboarding"
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              background: T.red,
              color: "white",
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Open dashboard
          </Link>
        ) : (
          <>
            <Link
              href="/onboarding"
              className="lp-nav-link"
              style={{ fontSize: 14, color: T.fgSoft, textDecoration: "none", fontWeight: 500 }}
            >
              Log in
            </Link>
            <Link
              href="/onboarding"
              style={{
                padding: "9px 18px",
                borderRadius: 8,
                background: T.red,
                color: "white",
                fontWeight: 700,
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              Sign up
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}

// ── Hero with thumbnail mosaic ──
// Replicates the ViewStats hero where the headline sits on top of a scattered
// arrangement of YouTube-style thumbnails. Here the "thumbnails" become
// dance-class clip placeholders + scribbled SVG arrows.
function Hero({ onCtaSignup }: { onCtaSignup: () => void }) {
  return (
    <section
      className="lp-hero"
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: "60px 32px 40px",
        textAlign: "center",
        position: "relative",
      }}
    >
      <h1
        className="lp-h1"
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 64,
          fontWeight: 800,
          letterSpacing: -2.2,
          lineHeight: 1.0,
          margin: "0 auto 20px",
          maxWidth: 900,
          color: T.ink,
        }}
      >
        Build a paid dance community
        <br />
        students actually open every week
      </h1>
      <p
        style={{
          fontSize: 17,
          lineHeight: 1.55,
          color: T.fgSoft,
          maxWidth: 600,
          margin: "0 auto 28px",
        }}
      >
        Threads, courses, live classes, 1-on-1 lessons, and weekly payouts. One place, your brand.
      </p>
      <div
        className="lp-cta-row"
        style={{
          display: "flex",
          gap: 12,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={onCtaSignup}
          style={{
            padding: "14px 24px",
            borderRadius: 10,
            border: "none",
            background: T.red,
            color: "white",
            fontWeight: 700,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          Sign up. Free for 30 days.
        </button>
        <Link
          href="/discovery"
          style={{
            padding: "14px 22px",
            borderRadius: 10,
            background: "white",
            color: T.fg,
            fontWeight: 600,
            fontSize: 15,
            border: `1px solid ${T.border}`,
            textDecoration: "none",
          }}
        >
          Continue free
        </Link>
      </div>

      <ThumbnailMosaic />
    </section>
  );
}

// Scattered grid of placeholder "thumbnails" with playful rotations.
function ThumbnailMosaic() {
  const items: Array<{ tone: Tone; w: number; h: number; rot: number; mt: number; label: string }> = [
    { tone: "warm", w: 200, h: 130, rot: -4, mt: 30, label: "bachata · floorwork" },
    { tone: "deep", w: 240, h: 150, rot: 2, mt: 0, label: "live · wk 3" },
    { tone: "red", w: 180, h: 120, rot: -2, mt: 40, label: "salsa drills" },
    { tone: "light", w: 220, h: 140, rot: 4, mt: 10, label: "kizomba pulse" },
    { tone: "warm", w: 200, h: 130, rot: -3, mt: 26, label: "cuban son · havana" },
    { tone: "deep", w: 230, h: 150, rot: 3, mt: 6, label: "shoulder drill" },
  ];
  return (
    <div
      className="lp-mosaic"
      style={{
        marginTop: 56,
        position: "relative",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: 20,
        maxWidth: 1100,
        marginLeft: "auto",
        marginRight: "auto",
      }}
    >
      {/* Hand-drawn arrow connecting two thumbnails — pure SVG, kept subtle */}
      <svg
        viewBox="0 0 1100 80"
        style={{
          position: "absolute",
          top: 30,
          left: 0,
          width: "100%",
          height: 80,
          pointerEvents: "none",
          zIndex: 0,
        }}
        aria-hidden
      >
        <path
          d="M 200 50 Q 320 -10 460 40"
          stroke={T.red}
          strokeWidth="2"
          fill="none"
          strokeDasharray="6 4"
          strokeLinecap="round"
        />
        <path d="M 455 35 L 470 42 L 458 50 Z" fill={T.red} />
      </svg>
      {items.map((it, i) => (
        <div
          key={i}
          style={{
            width: it.w,
            marginTop: it.mt,
            transform: `rotate(${it.rot}deg)`,
            zIndex: 1,
          }}
        >
          <Mock
            label={it.label}
            h={it.h}
            radius={10}
            tone={it.tone}
            style={{
              boxShadow: "0 18px 40px -18px rgba(0,0,0,0.25), 0 4px 10px -4px rgba(0,0,0,0.08)",
              border: `2px solid white`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

// ── Dark video band ──
function VideoBand() {
  return (
    <section
      style={{
        background: T.ink,
        color: "white",
        padding: "80px 32px",
        marginTop: 80,
      }}
    >
      <div style={{ maxWidth: 1000, margin: "0 auto", textAlign: "center" }}>
        <h2
          className="lp-h2"
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: -1.6,
            lineHeight: 1.1,
            margin: "0 auto 36px",
            maxWidth: 760,
          }}
        >
          We took the workflow of full-time dance teachers
          <br />
          and built it into one tool.
        </h2>
        <div
          style={{
            position: "relative",
            margin: "0 auto",
            borderRadius: 18,
            overflow: "hidden",
            aspectRatio: "16/9",
            background: "hsl(0, 0%, 12%)",
            border: `1px solid hsl(0, 0%, 22%)`,
          }}
        >
          <Mock label="founders' tour · 02:14" h="100%" radius={18} tone="deep" />
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
                width: 92,
                height: 92,
                borderRadius: "50%",
                background: T.red,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 16px 36px rgba(0,0,0,0.45)",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 0,
                  height: 0,
                  marginLeft: 7,
                  borderLeft: "24px solid white",
                  borderTop: "16px solid transparent",
                  borderBottom: "16px solid transparent",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Single horizontal row of small "tools" cards ──
const TOOLS: Array<{ label: string; tone: Tone }> = [
  { label: "Threads", tone: "warm" },
  { label: "Classroom", tone: "light" },
  { label: "Live", tone: "deep" },
  { label: "Private lessons", tone: "warm" },
  { label: "Memberships", tone: "red" },
  { label: "Discovery", tone: "ink" },
];

function ToolsRow() {
  return (
    <section style={{ maxWidth: 1280, margin: "70px auto 60px", padding: "0 32px" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <h2
          className="lp-h2"
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: -0.6,
            lineHeight: 1.2,
            margin: 0,
            color: T.ink,
          }}
        >
          The most complete toolkit for dance teachers
        </h2>
      </div>
      <div
        className="lp-tools"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 14,
        }}
      >
        {TOOLS.map((t, i) => (
          <div
            key={i}
            style={{
              background: T.card,
              border: `1px solid ${T.border}`,
              borderRadius: 14,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <Mock label={t.label.toLowerCase()} h={110} radius={9} tone={t.tone} />
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 14,
                fontWeight: 700,
                color: T.ink,
                textAlign: "center",
              }}
            >
              {t.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── FULL-BLEED RED claim panel — split: text left, ranked list right ──
function RedClaim() {
  const ranked = [
    "Threaded discussions, replies, reactions",
    "Drag-and-drop course builder",
    "Browser-based live classes",
    "1-on-1 private lessons (paid bookings)",
    "Tiered fees: 8 → 6 → 4%",
    "Weekly or monthly payouts",
    "Per-community email preferences",
    "Public discovery directory",
    "Custom subdomain · yourname.dance-hub.io",
    "Member & content export, any time",
  ];
  return (
    <section
      style={{
        background: T.red,
        color: "white",
        padding: "90px 32px",
      }}
    >
      <div
        className="lp-redclaim"
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 56,
          alignItems: "center",
        }}
      >
        <div>
          <h2
            className="lp-h2"
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 60,
              fontWeight: 800,
              letterSpacing: -2.2,
              lineHeight: 1.0,
              margin: "0 0 24px",
            }}
          >
            We know what makes a dance community show up every week.
          </h2>
          <p style={{ fontSize: 18, lineHeight: 1.55, opacity: 0.92, maxWidth: 460 }}>
            We talked to teachers running real floors. We wrote down what one tool would have to
            do. Then we built it. Every feature on this page is shipped.
          </p>
        </div>
        <div
          style={{
            background: "white",
            color: T.ink,
            borderRadius: 14,
            padding: 28,
            boxShadow: "0 30px 60px -25px rgba(0,0,0,0.4)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              marginBottom: 22,
              borderBottom: `1px solid ${T.border}`,
              paddingBottom: 16,
            }}
          >
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 56,
                fontWeight: 800,
                letterSpacing: -2,
                color: T.red,
                lineHeight: 1,
              }}
            >
              #1
            </div>
            <div style={{ fontSize: 14, color: T.fgSoft }}>
              Built ground-up <br /> for dance teachers
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {ranked.map((r, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  fontSize: 14,
                  paddingBottom: 10,
                  borderBottom: i === ranked.length - 1 ? "none" : `1px solid ${T.rule}`,
                }}
              >
                <span
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 11,
                    fontWeight: 700,
                    color: T.muted,
                    width: 22,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ flex: 1, color: T.fg }}>{r}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Connect-with-X-teachers band (image left, text right) ──
function ConnectBand() {
  return (
    <section style={{ maxWidth: 1180, margin: "90px auto 60px", padding: "0 32px" }}>
      <div
        className="lp-connect"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 56,
          alignItems: "center",
        }}
      >
        <Mock label="teachers' room · screenshot" h={380} radius={18} tone="ink" />
        <div>
          <Kicker>Teachers&apos; room</Kicker>
          <h2
            className="lp-h2"
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 44,
              fontWeight: 800,
              letterSpacing: -1.6,
              lineHeight: 1.05,
              margin: "0 0 18px",
              color: T.ink,
            }}
          >
            Build alongside other dance teachers
          </h2>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.6,
              color: T.fgSoft,
              maxWidth: 460,
              margin: "0 0 22px",
            }}
          >
            Every paying teacher gets a seat in our private space for working teachers: pricing
            playbooks, retention tactics, monthly office hours, a direct line to the team.
          </p>
          <Link
            href="/onboarding"
            style={{
              display: "inline-block",
              padding: "12px 22px",
              borderRadius: 10,
              background: T.red,
              color: "white",
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Join the room →
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Mid CTA + Pricing pair ──
function MidCTA({ onCtaSignup }: { onCtaSignup: () => void }) {
  return (
    <section style={{ maxWidth: 1100, margin: "90px auto 60px", padding: "0 32px" }}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <h2
          className="lp-h2"
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 56,
            fontWeight: 800,
            letterSpacing: -2,
            lineHeight: 1.0,
            margin: "0 0 12px",
            color: T.ink,
          }}
        >
          Your next class should be packed.
        </h2>
        <p style={{ fontSize: 16, color: T.fgSoft, maxWidth: 540, margin: "0 auto" }}>
          Get started with Dance-Hub today.
        </p>
      </div>
      <div
        className="lp-pricing-grid"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}
      >
        <PricingCard
          tier="Run your floor"
          price="Free"
          priceSuffix="for 30 days"
          subtitle="Everything in. Threads, classroom, live, private lessons, payments."
          features={[
            "Unlimited threads, channels, replies",
            "Courses with hosted video & progress",
            "Live classes from the browser",
            "Private 1-on-1 lessons with paid booking",
            "Public listing in the directory",
          ]}
          cta="Start your community"
          highlight
          onCta={onCtaSignup}
        />
        <PricingCard
          tier="How fees scale"
          price="4 → 8%"
          priceSuffix="of revenue"
          subtitle="A small share of money your members pay you. Drops as you grow."
          features={[
            "Under 50 paying members. 8%",
            "50 to 100 members. 6%",
            "Over 100 members. 4%",
            "Payouts: weekly or monthly",
            "Export your members & threads any time",
          ]}
          cta="See how it scales"
          onCta={onCtaSignup}
        />
      </div>
    </section>
  );
}

function PricingCard({
  tier,
  price,
  priceSuffix,
  subtitle,
  features,
  cta,
  highlight,
  onCta,
}: {
  tier: string;
  price: string;
  priceSuffix: string;
  subtitle: string;
  features: string[];
  cta: string;
  highlight?: boolean;
  onCta: () => void;
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: "30px 30px 26px",
        background: highlight ? T.red : T.card,
        color: highlight ? "white" : T.fg,
        border: highlight ? "none" : `1px solid ${T.border}`,
        boxShadow: highlight
          ? `0 24px 60px -22px rgba(2,82,52,0.4)`
          : "0 8px 24px -16px rgba(0,0,0,0.08)",
        position: "relative",
      }}
    >
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 11,
          letterSpacing: 2.5,
          textTransform: "uppercase",
          opacity: highlight ? 0.85 : 0.55,
          marginBottom: 10,
          fontWeight: 700,
        }}
      >
        {tier}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 12 }}>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 52,
            fontWeight: 800,
            letterSpacing: -1.6,
            lineHeight: 1,
          }}
        >
          {price}
        </div>
        <div style={{ fontSize: 16, opacity: 0.7 }}>{priceSuffix}</div>
      </div>
      <p
        style={{
          fontSize: 14,
          lineHeight: 1.55,
          margin: "0 0 22px",
          opacity: highlight ? 0.92 : 1,
          color: highlight ? "white" : T.fgSoft,
        }}
      >
        {subtitle}
      </p>
      <button
        onClick={onCta}
        style={{
          width: "100%",
          padding: "13px 18px",
          borderRadius: 10,
          background: highlight ? "white" : T.ink,
          color: highlight ? T.red : "white",
          border: "none",
          fontWeight: 700,
          fontSize: 14,
          cursor: "pointer",
          marginBottom: 22,
        }}
      >
        {cta} →
      </button>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {features.map((f, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            <span
              style={{
                flexShrink: 0,
                marginTop: 4,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: highlight ? "rgba(255,255,255,0.18)" : T.redSoft,
                color: highlight ? "white" : T.red,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                fontWeight: 700,
              }}
            >
              ✓
            </span>
            <span>{f}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── FAQ ──
const FAQS = [
  {
    q: "How is Dance-Hub different from Skool, Patreon or Discord?",
    a: "Skool is built for online business courses. Patreon for podcasters and artists. Discord is a chat app. Dance-Hub does what dance teachers actually need in one place: a feed, a classroom, live classes, paid 1-on-1 lessons, plus the membership and payout machinery underneath.",
  },
  {
    q: "What does it cost?",
    a: "0% platform fees for the first 30 days. After that, 8% under 50 members, 6% to 100, 4% above. No setup fee, no monthly seat fee.",
  },
  {
    q: "Can I import my videos?",
    a: "Yes. Drag-and-drop upload to any chapter. We host and transcode for you, so the same file plays smoothly on phones, tablets, and laptops.",
  },
  {
    q: "When do I get paid?",
    a: "On your schedule. Connect your payment account, choose weekly or monthly payouts, and money lands in your bank on that cadence.",
  },
  {
    q: "Who owns the community?",
    a: "You do. You can export your members, threads, and courses any time, no plan changes, no support tickets.",
  },
  {
    q: "Does it work on mobile?",
    a: "Yes. Fully responsive. Native iOS and Android apps are on the roadmap, not shipped.",
  },
];
function FAQ() {
  return (
    <section style={{ maxWidth: 880, margin: "60px auto 40px", padding: "0 32px" }}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <h2
          className="lp-h2"
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: -1.4,
            lineHeight: 1,
            margin: 0,
            color: T.ink,
          }}
        >
          FAQ
        </h2>
      </div>
      <div style={{ borderTop: `1px solid ${T.border}` }}>
        {FAQS.map((f, i) => (
          <details
            key={i}
            style={{ borderBottom: `1px solid ${T.border}`, padding: "18px 4px" }}
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
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: -0.4,
                lineHeight: 1.3,
                color: T.ink,
              }}
            >
              {f.q}
              <span
                style={{
                  flexShrink: 0,
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: T.redSoft,
                  color: T.red,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                +
              </span>
            </summary>
            <div
              style={{ fontSize: 15, lineHeight: 1.65, color: T.fgSoft, marginTop: 12, maxWidth: 720 }}
            >
              {f.a}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

// ── FULL-BLEED RED founder block ──
function RedFounder() {
  return (
    <section style={{ background: T.red, color: "white", padding: "70px 32px" }}>
      <div
        className="lp-letter"
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1.1fr 1fr",
          gap: 56,
          alignItems: "center",
        }}
      >
        <div>
          <Kicker color="rgba(255,255,255,0.85)">Built by the team behind Dance-Hub</Kicker>
          <h2
            className="lp-h2"
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 38,
              fontWeight: 800,
              letterSpacing: -1.2,
              lineHeight: 1.1,
              margin: "0 0 22px",
            }}
          >
            Built by people who got tired of gluing five tools together every Sunday.
          </h2>
          <div style={{ fontSize: 15, lineHeight: 1.7, opacity: 0.95 }}>
            <p style={{ margin: "0 0 14px" }}>
              Before Dance-Hub, running a paid floor meant six tabs open at once. We talked to
              teachers running real floors, physical and virtual, and wrote down what one tool
              would have to do. Then we built it.
            </p>
            <p style={{ margin: "0 0 18px" }}>
              It&apos;s for teachers who run a real community and want to keep the relationship
              with their students intact.
            </p>
          </div>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 17 }}>
            The Dance-Hub team
          </div>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>Built in Estonia 🇪🇪</div>
        </div>
        <div style={{ position: "relative" }}>
          <Mock
            label="studio · founders"
            h={380}
            radius={16}
            tone="warm"
            style={{ border: "4px solid white", boxShadow: "0 24px 50px -20px rgba(0,0,0,0.4)" }}
          />
        </div>
      </div>
    </section>
  );
}

// ── Final CTA: dark band with 3 phone mockups ──
function FinalCTA({ onCtaSignup }: { onCtaSignup: () => void }) {
  return (
    <section style={{ background: T.ink, color: "white", padding: "80px 32px 60px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", textAlign: "center" }}>
        <h2
          className="lp-h2"
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 52,
            fontWeight: 800,
            letterSpacing: -1.8,
            lineHeight: 1.0,
            margin: "0 auto 22px",
            maxWidth: 800,
          }}
        >
          Start running your dance community today
        </h2>
        <button
          onClick={onCtaSignup}
          style={{
            padding: "16px 28px",
            borderRadius: 10,
            border: "none",
            background: T.red,
            color: "white",
            fontWeight: 700,
            fontSize: 16,
            cursor: "pointer",
            marginBottom: 50,
          }}
        >
          Sign up. Free for 30 days.
        </button>

        <div
          className="lp-phones"
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end",
            gap: 24,
            flexWrap: "wrap",
            marginTop: 30,
          }}
        >
          <Phone label="Threads" tone="warm" rotate={-6} h={420} accentText="2 new replies" />
          <Phone label="Live class" tone="red" rotate={0} h={460} accentText="Live in 14m" />
          <Phone label="Classroom" tone="light" rotate={6} h={420} accentText="Wk 3 unlocked" />
        </div>
      </div>
    </section>
  );
}

function Phone({
  label,
  tone,
  rotate,
  h,
  accentText,
}: {
  label: string;
  tone: Tone;
  rotate: number;
  h: number;
  accentText: string;
}) {
  return (
    <div
      style={{
        width: 200,
        height: h,
        borderRadius: 32,
        background: T.ink,
        border: "7px solid hsl(0, 0%, 0%)",
        padding: 7,
        boxShadow: "0 30px 60px -20px rgba(0,0,0,0.6)",
        transform: `rotate(${rotate}deg)`,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 25,
          background: T.bg,
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 6px",
          }}
        >
          <DHMark size={16} color={T.red} />
          <span style={{ fontSize: 10, fontWeight: 800, color: T.fg }}>BachataFlow</span>
        </div>
        <div
          style={{
            background: T.red,
            color: "white",
            borderRadius: 8,
            padding: 8,
            fontSize: 9,
          }}
        >
          <div style={{ fontSize: 7, opacity: 0.85, letterSpacing: 1 }}>{accentText.toUpperCase()}</div>
          <div style={{ fontWeight: 800, fontSize: 11, marginTop: 2 }}>{label}</div>
        </div>
        <Mock label={label.toLowerCase()} h={140} radius={8} tone={tone} />
        <div
          style={{
            background: "white",
            borderRadius: 8,
            padding: 8,
            fontSize: 9,
            border: `1px solid ${T.border}`,
          }}
        >
          <div style={{ fontWeight: 700, color: T.fg, marginBottom: 2 }}>Marta · 2h</div>
          <div style={{ color: T.muted, lineHeight: 1.4 }}>Standing leg cue…</div>
        </div>
      </div>
    </div>
  );
}

// ── Footer ──
function FooterBlock() {
  return (
    <footer style={{ background: T.ink, color: "rgba(255,255,255,0.7)", padding: "32px 32px 28px" }}>
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 12,
          opacity: 0.7,
          flexWrap: "wrap",
          gap: 12,
          borderTop: `1px solid rgba(255,255,255,0.12)`,
          paddingTop: 28,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <DHMark size={20} color="white" />
          <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, color: "white" }}>
            Dance-Hub
          </span>
          <span style={{ marginLeft: 14 }}>© {new Date().getFullYear()} · Built in Estonia 🇪🇪</span>
        </div>
        <div style={{ display: "flex", gap: 22 }}>
          <Link href="/discovery" style={{ color: "inherit", textDecoration: "none" }}>
            Discover
          </Link>
          <Link href="/terms" style={{ color: "inherit", textDecoration: "none" }}>
            Terms
          </Link>
          <Link href="/privacy" style={{ color: "inherit", textDecoration: "none" }}>
            Privacy
          </Link>
        </div>
      </div>
    </footer>
  );
}

// ── Page ──
export default function LandingAltClient() {
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
    <div style={{ background: T.bg, color: T.fg, fontFamily: FONT_BODY, overflowX: "hidden" }}>
      <style>{`
        .lp-h1 { font-size: 64px; }
        .lp-h2 { font-size: 48px; }
        @media (max-width: 1080px) {
          .lp-tools { grid-template-columns: repeat(3, 1fr) !important; }
          .lp-redclaim, .lp-connect, .lp-letter { grid-template-columns: 1fr !important; gap: 36px !important; }
        }
        @media (max-width: 820px) {
          .lp-h1 { font-size: 38px !important; letter-spacing: -1.2px !important; }
          .lp-h2 { font-size: 28px !important; letter-spacing: -1px !important; }
          .lp-nav-link { display: none !important; }
          .lp-tools { grid-template-columns: repeat(2, 1fr) !important; }
          .lp-mosaic > div { width: 130px !important; }
          .lp-pricing-grid { grid-template-columns: 1fr !important; }
          .lp-phones { gap: 12px !important; }
          .lp-phones > div { transform: scale(0.7) !important; margin: -40px -20px !important; }
        }
      `}</style>

      <Nav user={user} />
      <Hero onCtaSignup={onCtaSignup} />
      <VideoBand />
      <ToolsRow />
      <RedClaim />
      <ConnectBand />
      <MidCTA onCtaSignup={onCtaSignup} />
      <FAQ />
      <RedFounder />
      <FinalCTA onCtaSignup={onCtaSignup} />
      <FooterBlock />
    </div>
  );
}
