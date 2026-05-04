"use client";

import Link from "next/link";
import { CSSProperties } from "react";
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

// ── 1. Promo banner ──
function PromoBanner() {
  return (
    <div
      style={{
        background: LT.ink,
        color: "white",
        padding: "10px 20px",
        textAlign: "center",
        fontSize: 13,
        letterSpacing: 0.2,
      }}
      className="lp-promo"
    >
      <span
        style={{
          background: LT.gold,
          color: LT.ink,
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
      <span style={{ opacity: 0.9 }}>
        Run your community with{" "}
        <b style={{ color: LT.gold }}>0% platform fees</b> for your first 30 days.
      </span>{" "}
      <Link
        href="/onboarding"
        style={{ color: LT.gold, fontWeight: 600, textDecoration: "underline", marginLeft: 8 }}
      >
        Start now →
      </Link>
    </div>
  );
}

// ── 2. Nav ──
function Nav({ user }: { user: unknown }) {
  const isAuthed = !!user;
  return (
    <nav
      className="lp-nav"
      style={{
        maxWidth: 1320,
        margin: "0 auto",
        padding: "20px 32px",
        display: "flex",
        alignItems: "center",
        gap: 32,
      }}
    >
      <Link
        href="/"
        style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: LT.fg }}
      >
        <DHMark size={32} />
        <span style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, letterSpacing: -0.4 }}>
          Dance-Hub
        </span>
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 1,
            padding: "2px 6px",
            borderRadius: 4,
            background: LT.primary,
            color: "white",
            marginLeft: 4,
          }}
        >
          BETA
        </span>
      </Link>
      <div
        className="lp-nav-links"
        style={{ display: "flex", gap: 26, fontSize: 14, color: LT.fgSoft, marginLeft: 24 }}
      >
        <Link
          href="/discovery"
          style={{ color: "inherit", textDecoration: "none" }}
        >
          Discover communities
        </Link>
        <a href="#features" style={{ color: "inherit", textDecoration: "none" }}>
          Features
        </a>
        <a href="#pricing" style={{ color: "inherit", textDecoration: "none" }}>
          Pricing
        </a>
        <a href="#faq" style={{ color: "inherit", textDecoration: "none" }}>
          FAQ
        </a>
      </div>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
        {isAuthed ? (
          <Link
            href="/onboarding"
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              background: LT.ink,
              color: "white",
              fontWeight: 600,
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
              style={{ fontSize: 14, color: LT.fgSoft, textDecoration: "none" }}
              className="lp-login-link"
            >
              Log in
            </Link>
            <Link
              href="/onboarding"
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                background: LT.ink,
                color: "white",
                fontWeight: 600,
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

// ── 3. Hero ──
function Hero({ onCtaSignup }: { onCtaSignup: () => void }) {
  return (
    <section
      style={{ maxWidth: 1240, margin: "0 auto", padding: "60px 32px 40px", textAlign: "center" }}
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
        The community OS for dance teachers
      </div>
      <h1
        className="lp-h1"
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 76,
          fontWeight: 600,
          letterSpacing: -2.8,
          lineHeight: 1.0,
          margin: "0 auto 22px",
          maxWidth: 1000,
        }}
      >
        Run a paid dance community
        <br />
        your students{" "}
        <span
          style={{
            color: LT.primary,
            background: `linear-gradient(180deg, transparent 62%, ${LT.primarySoft} 62%)`,
            padding: "0 6px",
          }}
        >
          actually open every week.
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
        Threads, courses, live classes, and 1-on-1 lessons. One place to host your floor, get paid,
        and keep the relationship with your students. No Discord plumbing, no Stripe-to-Patreon
        spreadsheet, no sales bot.
      </p>
      <div
        className="lp-cta-row"
        style={{ display: "flex", gap: 14, justifyContent: "center", alignItems: "center", marginBottom: 22, flexWrap: "wrap" }}
      >
        <button
          onClick={onCtaSignup}
          style={{
            padding: "15px 26px",
            borderRadius: 12,
            border: "none",
            background: LT.primary,
            color: "white",
            fontWeight: 700,
            fontSize: 15,
            cursor: "pointer",
            boxShadow: `0 10px 26px -10px ${LT.primary}`,
          }}
        >
          Create your community — free
        </button>
        <Link
          href="/discovery"
          style={{
            padding: "15px 22px",
            borderRadius: 12,
            background: "white",
            color: LT.fg,
            fontWeight: 600,
            fontSize: 15,
            border: `1px solid ${LT.border}`,
            textDecoration: "none",
          }}
        >
          Browse communities →
        </Link>
      </div>
      <div style={{ fontSize: 13, color: LT.muted, marginBottom: 50 }}>
        0% platform fees for 30 days. No card required. 5-minute setup.
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
            dance-hub.io/c/bachataflow
          </span>
        </div>

        <div
          className="lp-hero-app"
          style={{ display: "grid", gridTemplateColumns: "220px 1fr 280px", gap: 0, minHeight: 540 }}
        >
          {/* Sidebar */}
          <div
            className="lp-hero-side"
            style={{ padding: 18, borderRight: `1px solid ${LT.rule}`, background: LT.bg }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 18,
                padding: 8,
                borderRadius: 10,
                background: LT.card,
                border: `1px solid ${LT.border}`,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: `linear-gradient(135deg, ${LT.primary}, ${LT.accent})`,
                }}
              />
              <div style={{ fontSize: 12, fontWeight: 700 }}>BachataFlow</div>
            </div>
            {(
              [
                ["✦ Community", true],
                ["◆ Classroom", false],
                ["♪ Calendar", false],
                ["◉ Members", false],
                ["❉ About", false],
              ] as Array<[string, boolean]>
            ).map(([x, on], i) => (
              <div
                key={i}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  fontSize: 13,
                  background: on ? LT.primarySoft : "transparent",
                  color: on ? LT.primaryDeep : LT.muted,
                  fontWeight: on ? 600 : 500,
                  marginBottom: 3,
                }}
              >
                {x}
              </div>
            ))}
            <div
              style={{
                borderTop: `1px solid ${LT.rule}`,
                margin: "14px 0 8px",
                paddingTop: 8,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: LT.muted,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                Channels
              </div>
              {["# technique", "# musicality", "# showcases", "# q-and-a"].map((x, i) => (
                <div key={i} style={{ padding: "5px 10px", fontSize: 12, color: LT.muted }}>
                  {x}
                </div>
              ))}
            </div>
          </div>

          {/* Main feed */}
          <div style={{ padding: 22, background: LT.card }}>
            <div
              style={{
                borderRadius: 14,
                overflow: "hidden",
                marginBottom: 18,
                background: `linear-gradient(135deg, ${LT.primary} 0%, ${LT.accent} 100%)`,
                padding: "18px 22px",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 600,
                    fontSize: 22,
                    letterSpacing: -0.5,
                  }}
                >
                  Bachata · Floorwork Wk 3
                </div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                  Live in 14 minutes · 86 going
                </div>
              </div>
              <div
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  background: "white",
                  color: LT.primaryDeep,
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                Join class →
              </div>
            </div>

            {[
              {
                name: "Marta S.",
                initial: "M",
                color: LT.secondary,
                time: "2h",
                title: "Grounding through the standing leg",
                body: "I used to tell students 'push the floor away.' I now think this language is actively…",
                reactions: 24,
                replies: 8,
              },
              {
                name: "Kofi A.",
                initial: "K",
                color: LT.coral,
                time: "5h",
                title: "My shoulder tension drill — 4 mins, no music",
                body: "Filmed this morning before class. Borrowed from a Cuban son teacher in Havana, adapted for…",
                reactions: 41,
                replies: 12,
              },
            ].map((p, i) => (
              <div
                key={i}
                style={{
                  border: `1px solid ${LT.border}`,
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: p.color,
                      color: "white",
                      fontSize: 12,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {p.initial}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: LT.muted }}>· {p.time}</span>
                </div>
                <div
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: 15,
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  {p.title}
                </div>
                <div
                  style={{ fontSize: 12, color: LT.muted, lineHeight: 1.5, marginBottom: 8 }}
                >
                  {p.body}
                </div>
                <div style={{ display: "flex", gap: 14, fontSize: 11, color: LT.muted }}>
                  <span>♥ {p.reactions}</span>
                  <span>↩ {p.replies} replies</span>
                </div>
              </div>
            ))}
          </div>

          {/* Right rail */}
          <div
            className="lp-hero-rail"
            style={{ padding: 18, borderLeft: `1px solid ${LT.rule}`, background: LT.bg }}
          >
            <div
              style={{
                fontSize: 10,
                color: LT.muted,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              This month
            </div>
            <div
              style={{
                background: "white",
                borderRadius: 12,
                padding: 14,
                marginBottom: 14,
                border: `1px solid ${LT.border}`,
              }}
            >
              <div style={{ fontSize: 11, color: LT.muted, marginBottom: 4 }}>Net revenue</div>
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: -0.8,
                }}
              >
                €4,380
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "hsl(145, 55%, 42%)",
                  fontWeight: 600,
                  marginTop: 2,
                }}
              >
                ▲ 18% vs last month
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 36, marginTop: 12 }}>
                {[40, 52, 48, 56, 62, 70, 80].map((h, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${h}%`,
                      borderRadius: 3,
                      background: i >= 5 ? LT.primary : `${LT.primary}55`,
                    }}
                  />
                ))}
              </div>
            </div>
            <div
              style={{
                fontSize: 10,
                color: LT.muted,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Live now in your niche
            </div>
            {(
              [
                ["BF", "BachataFlow", "142 online"],
                ["KZ", "Kizomba Coll.", "78 online"],
                ["AH", "Afro House Lab", "61 online"],
              ] as Array<[string, string, string]>
            ).map(([i, n, m], k) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 0",
                  borderTop: k === 0 ? "none" : `1px solid ${LT.rule}`,
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    background: [LT.primary, LT.accent, LT.coral][k],
                    color: "white",
                    fontSize: 10,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {i}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{n}</div>
                  <div style={{ fontSize: 10, color: LT.muted }}>
                    <span style={{ color: "hsl(0, 70%, 55%)" }}>●</span> {m}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
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
        <br />
        Not creators. Not gamers. Not founders.
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

// ── 5. Feature rows ──
type FeatureRow = {
  kicker: string;
  title: string;
  body: string;
  tone: PhotoTone;
  side: "left" | "right";
};

const FEATURES: FeatureRow[] = [
  {
    kicker: "01 · Community feed",
    title: "Threads, replies, reactions — and the people stay yours",
    body: "Your community space, your members. Threaded discussions, categories per topic, pinned posts, likes and replies. Members get notified when their teacher posts. You own the relationship — not Instagram, not Discord, not us.",
    tone: "lavender",
    side: "right",
  },
  {
    kicker: "02 · Classroom",
    title: "Courses with chapters, lessons, and progress tracking",
    body: "Upload your videos, structure them into chapters and lessons, and your students mark their way through. Streaming and transcoding handled by Mux, so it just works on phones, tablets, laptops, big screens — without you thinking about codecs.",
    tone: "gold",
    side: "left",
  },
  {
    kicker: "03 · Live classes",
    title: "Stream live to your community — straight from the browser",
    body: "Schedule it on the calendar, hit go-live in your community. Browser-based video rooms with chat, screen-share, and hand-raise — built on LiveKit, not Zoom links you have to copy-paste. Members see live classes appear right where they already are.",
    tone: "deep",
    side: "right",
  },
  {
    kicker: "04 · Private lessons",
    title: "1-on-1 lessons, booked and paid before the door opens",
    body: "Set your hourly rate, set your availability, share the link. Students book and pay through Stripe. They get a private video room with a token-protected link. You get a calendar event and a paid booking. No back-and-forth, no chasing payments.",
    tone: "warm",
    side: "left",
  },
  {
    kicker: "05 · Memberships & payouts",
    title: "Up to 96% goes to you. Stripe under the hood. Your payout schedule.",
    body: "0% platform fees for the first 30 days. After that: 8% under 50 members, 6% to 100, 4% beyond. Connect your Stripe in three clicks. Choose weekly or monthly payouts. Refunds, subscriptions, and one-offs all in one dashboard.",
    tone: "lavender",
    side: "right",
  },
  {
    kicker: "06 · Discovery",
    title: "A public directory that brings new students to your floor",
    body: "Every community on Dance-Hub is listed in our public directory. Browse by activity, language, region. Free traffic to teachers — measured by what their members do, not by who pays for placement.",
    tone: "deep",
    side: "left",
  },
  {
    kicker: "07 · Email & broadcasts",
    title: "Reach your members without burning the inbox",
    body: "Send announcements to your community — new course, going live, the studio is back open. Every member controls marketing, course-announcement, and broadcast preferences per community. Built-in monthly quotas keep your sender reputation clean and your members opted-in.",
    tone: "gold",
    side: "right",
  },
];

function FeatureRows() {
  return (
    <section
      id="features"
      style={{ maxWidth: 1240, margin: "60px auto", padding: "0 32px" }}
      className="lp-features"
    >
      <div style={{ textAlign: "center", marginBottom: 56 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: LT.primary,
            marginBottom: 12,
            fontWeight: 600,
          }}
        >
          ─── Everything in one place
        </div>
        <h2
          className="lp-h2"
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 48,
            fontWeight: 600,
            letterSpacing: -1.6,
            lineHeight: 1.05,
            margin: 0,
          }}
        >
          The toolkit for teachers running
          <br />a paid floor — physical or virtual
        </h2>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 80 }}>
        {FEATURES.map((f, i) => (
          <FeatureRowEl key={i} {...f} />
        ))}
      </div>
    </section>
  );
}

function FeatureRowEl({ kicker, title, body, tone, side }: FeatureRow) {
  const image = (
    <div style={{ flex: 1 }}>
      <PhotoPlaceholder
        label={`${kicker.split(" · ")[1]} · product shot`}
        h={360}
        radius={18}
        tone={tone}
        style={{ boxShadow: "0 30px 60px -25px rgba(60,30,100,0.3)" }}
      />
    </div>
  );
  const text = (
    <div style={{ flex: 1, padding: "0 12px" }}>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 12,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: LT.primary,
          marginBottom: 16,
          fontWeight: 600,
        }}
      >
        {kicker}
      </div>
      <h3
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 36,
          fontWeight: 600,
          letterSpacing: -1.2,
          lineHeight: 1.1,
          margin: "0 0 18px",
        }}
      >
        {title}
      </h3>
      <p style={{ fontSize: 16, lineHeight: 1.6, color: LT.fgSoft, margin: 0, maxWidth: 480 }}>
        {body}
      </p>
    </div>
  );
  return (
    <div className="lp-feature-row" style={{ display: "flex", alignItems: "center", gap: 56 }}>
      {side === "left" ? (
        <>
          {image}
          {text}
        </>
      ) : (
        <>
          {text}
          {image}
        </>
      )}
    </div>
  );
}

// ── 6. Bold claim with stats ──
function BoldClaim() {
  return (
    <section
      style={{
        background: LT.ink,
        color: "white",
        padding: "90px 0",
        margin: "60px 0",
        position: "relative",
        overflow: "hidden",
      }}
      className="lp-claim"
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.08,
          background: `repeating-linear-gradient(135deg, transparent 0 24px, ${LT.secondary} 24px 25px)`,
        }}
      />
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "0 32px",
          position: "relative",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: LT.gold,
            marginBottom: 24,
            fontWeight: 600,
          }}
        >
          ─── Why teachers pick Dance-Hub
        </div>
        <h2
          className="lp-h2"
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 60,
            fontWeight: 600,
            letterSpacing: -2,
            lineHeight: 1.0,
            margin: "0 0 28px",
          }}
        >
          Built for the floor.{" "}
          <span
            style={{
              color: LT.secondary,
              fontStyle: "italic",
              fontFamily: FONT_ITALIC,
              fontWeight: 400,
            }}
          >
            It shows.
          </span>
        </h2>
        <p
          style={{
            fontSize: 18,
            lineHeight: 1.55,
            opacity: 0.75,
            maxWidth: 720,
            margin: "0 auto 50px",
          }}
        >
          Skool was built for online business courses. Patreon for podcasters. Discord for gamers.
          Dance-Hub is the only one where the platform is shaped like the way teachers actually
          run a community: feed, classroom, live class, private lesson, payout. In one place.
        </p>
        <div
          className="lp-stats"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 0,
            borderTop: `1px solid rgba(255,255,255,0.15)`,
            paddingTop: 36,
          }}
        >
          {(
            [
              ["0%", "Fees · first 30 days"],
              ["8 → 4%", "Drops as you grow"],
              ["Weekly", "Stripe payouts"],
              ["100%", "Yours · export anytime"],
            ] as Array<[string, string]>
          ).map(([n, l], i) => (
            <div
              key={i}
              style={{
                borderLeft: i === 0 ? "none" : `1px solid rgba(255,255,255,0.15)`,
                padding: "0 24px",
              }}
            >
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: 56,
                  fontWeight: 600,
                  letterSpacing: -1.6,
                  color: LT.gold,
                }}
              >
                {n}
              </div>
              <div
                style={{
                  fontSize: 12,
                  opacity: 0.6,
                  textTransform: "uppercase",
                  letterSpacing: 2,
                  marginTop: 6,
                }}
              >
                {l}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 7. "What you don't have to build" band ──
function CommunityBand() {
  const handled = [
    "Auth & user accounts",
    "Video hosting (Mux)",
    "Live class rooms (LiveKit)",
    "Stripe Connect onboarding",
    "Subscriptions & refunds",
    "Receipts & email broadcasts",
    "Public directory listing",
    "Mobile-responsive UI",
  ];
  return (
    <section style={{ maxWidth: 1240, margin: "60px auto", padding: "0 32px" }}>
      <div
        className="lp-band"
        style={{
          background: LT.card,
          border: `1px solid ${LT.border}`,
          borderRadius: 24,
          padding: "52px 56px",
          display: "grid",
          gridTemplateColumns: "1fr 1.1fr",
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
            ─── What you don&apos;t have to build
          </div>
          <h2
            className="lp-h2"
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 42,
              fontWeight: 600,
              letterSpacing: -1.4,
              lineHeight: 1.05,
              margin: "0 0 18px",
            }}
          >
            The boring plumbing,{" "}
            <span style={{ color: LT.primary }}>solved.</span>
          </h2>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.55,
              color: LT.fgSoft,
              margin: "0 0 26px",
              maxWidth: 460,
            }}
          >
            You teach. We handle the rest. Everything below is wired in on day one — so your
            Sunday goes back to choreography instead of plugging a sixth tool into a Google Sheet.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
            {handled.map((p, i) => (
              <div
                key={i}
                style={{
                  padding: "7px 14px",
                  borderRadius: 999,
                  background: LT.primarySoft,
                  color: LT.primaryDeep,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {p}
              </div>
            ))}
          </div>
          <Link
            href="/discovery"
            style={{
              display: "inline-block",
              padding: "12px 22px",
              borderRadius: 10,
              background: LT.primary,
              color: "white",
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            See it in a real community →
          </Link>
        </div>
        <div>
          <PhotoPlaceholder label="admin dashboard · screenshot" h={340} radius={16} tone="lavender" />
        </div>
      </div>
    </section>
  );
}

// ── 8. Pricing ──
function Pricing({ onCtaSignup }: { onCtaSignup: () => void }) {
  return (
    <section
      id="pricing"
      style={{ maxWidth: 1240, margin: "80px auto 60px", padding: "0 32px" }}
    >
      <div style={{ textAlign: "center", marginBottom: 50 }}>
        <h2
          className="lp-h2"
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 48,
            fontWeight: 600,
            letterSpacing: -1.6,
            lineHeight: 1.05,
            margin: "0 0 14px",
          }}
        >
          Your next paying community
          <br />
          starts today
        </h2>
        <p style={{ fontSize: 16, color: LT.fgSoft, maxWidth: 540, margin: "0 auto" }}>
          One plan. 0% for your first 30 days. After that, a small share of revenue that drops as
          you grow. No setup, no monthly seat fee, no upsell.
        </p>
      </div>
      <div className="lp-pricing-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <PricingCard
          tier="Run your floor"
          price="Free"
          priceSuffix="for 30 days"
          subtitle="Build your community, set up your courses, plug in Stripe. Keep 100% of revenue for the first month, while you find your rhythm."
          highlight
          features={[
            "Threads, channels, replies, reactions",
            "Courses with Mux video & progress tracking",
            "Live classes from the browser (LiveKit)",
            "Private 1-on-1 lessons with paid booking",
            "Memberships, bundles, one-offs (Stripe)",
            "Public listing in the discovery directory",
          ]}
          cta="Create your community"
          onCta={onCtaSignup}
        />
        <PricingCard
          tier="How fees scale"
          price="4 → 8%"
          priceSuffix="of revenue"
          subtitle="After day 30, we take a small share of money your members pay you. The more you grow, the lower it gets. Card processing (Stripe) is on top of this — same as anywhere."
          features={[
            "Under 50 paying members — 8%",
            "50 to 100 members — 6%",
            "Over 100 members — 4%",
            "Stripe payouts: weekly or monthly, your call",
            "Refunds, subscriptions, one-offs included",
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
      className="lp-price-card"
      style={{
        borderRadius: 22,
        padding: "36px 36px 32px",
        background: highlight ? LT.primary : LT.card,
        color: highlight ? "white" : LT.fg,
        border: highlight ? "none" : `1px solid ${LT.border}`,
        boxShadow: highlight
          ? `0 24px 60px -20px ${LT.primary}`
          : "0 8px 24px -16px rgba(60,30,100,0.1)",
        position: "relative",
      }}
    >
      {highlight && (
        <div
          style={{
            position: "absolute",
            top: 22,
            right: 22,
            padding: "5px 11px",
            borderRadius: 999,
            background: LT.gold,
            color: LT.ink,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          Day 1 — Day 30
        </div>
      )}
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 12,
          letterSpacing: 2,
          textTransform: "uppercase",
          opacity: highlight ? 0.85 : 0.6,
          marginBottom: 14,
        }}
      >
        {tier}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 14 }}>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 56,
            fontWeight: 600,
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
          opacity: highlight ? 0.9 : 1,
          color: highlight ? "white" : LT.fgSoft,
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
          background: highlight ? "white" : LT.ink,
          color: highlight ? LT.primaryDeep : "white",
          border: "none",
          fontWeight: 700,
          fontSize: 14,
          cursor: "pointer",
          marginBottom: 26,
        }}
      >
        {cta} →
      </button>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: highlight ? "rgba(255,255,255,0.2)" : LT.primarySoft,
                color: highlight ? "white" : LT.primary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
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

// ── 9. FAQ ──
const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "How is Dance-Hub different from Skool, Patreon or Discord?",
    a: "Skool is built for online business courses. Patreon for podcasters and artists who want a tip jar. Discord is a chat app. Dance-Hub is one place that does what dance teachers actually need: a feed for the community, a classroom for the curriculum, live classes, paid 1-on-1 lessons, and the membership and payout machinery underneath all of it. No bolting five tools together.",
  },
  {
    q: "What does it cost to start?",
    a: "Nothing. Run your community with 0% platform fees for the first 30 days. After that we take a share of revenue that drops as you grow: 8% under 50 members, 6% to 100, 4% above. No setup fee, no monthly seat fee. Stripe processing is on top, same as any other platform.",
  },
  {
    q: "Can I import my videos to the Classroom?",
    a: "Yes. Drag-and-drop upload to any chapter. We use Mux to host and transcode, so the same file plays smoothly on phones, tablets, and laptops without you thinking about formats.",
  },
  {
    q: "When do I get paid?",
    a: "On your schedule. Connect Stripe, choose weekly or monthly payouts, and money lands in your bank on that cadence. Standard 7-day buffer for chargebacks, then everything moves on schedule.",
  },
  {
    q: "Who owns the community? My members or you?",
    a: "You do. You can export your members, your threads, and your courses any time, no plan changes, no support tickets. We host the floor; the floor is yours.",
  },
  {
    q: "Does it work on mobile?",
    a: "Yes. Dance-Hub is fully responsive — your community, classroom, live classes and 1-on-1 video sessions work in any modern mobile browser. Native iOS and Android apps are on the roadmap, not shipped.",
  },
  {
    q: "I have a question that isn't here.",
    a: "Email info@latinpassion.ee. It goes to a real person on the team. We try to reply within a working day.",
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
          ─── FAQ
        </div>
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

// ── 10. Founder note ──
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
            ─── A note from the team
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
            Built by people who got tired of{" "}
            <span
              style={{
                color: LT.primary,
                fontStyle: "italic",
                fontFamily: FONT_ITALIC,
                fontWeight: 400,
              }}
            >
              gluing five tools together every Sunday.
            </span>
          </h2>
          <div style={{ fontSize: 16, lineHeight: 1.7, color: LT.fgSoft, marginBottom: 24 }}>
            <p style={{ margin: "0 0 14px" }}>Hey teachers,</p>
            <p style={{ margin: "0 0 14px" }}>
              Before Dance-Hub, running a paid floor meant a Discord, a Patreon, a Thinkific
              course, two Stripe accounts, a Mailchimp list and a Google Sheet that broke once a
              month. Sunday afternoons weren&apos;t for class prep — they were for tool plumbing.
            </p>
            <p style={{ margin: "0 0 14px" }}>
              We talked to teachers running real floors — physical and virtual. They all had the
              same six tabs open. So we wrote down what one tool would have to do, and started
              building.
            </p>
            <p style={{ margin: "0 0 18px" }}>
              Dance-Hub is that tool. It&apos;s not for course launchers, business gurus, or
              creators selling AI prompts. It&apos;s for teachers who run a real community — and
              want to keep the relationship with their students intact.
            </p>
            <div
              style={{
                fontFamily: FONT_ITALIC,
                fontStyle: "italic",
                fontSize: 22,
                color: LT.fg,
              }}
            >
              — The Dance-Hub team
            </div>
            <div style={{ fontSize: 13, color: LT.muted, marginTop: 6 }}>
              Built in Estonia 🇪🇪
            </div>
          </div>
        </div>
        <div>
          <PhotoPlaceholder label="studio · founders" h={420} radius={18} tone="warm" />
        </div>
      </div>
    </section>
  );
}

// ── 11. Final CTA ──
function FinalCTA({ onCtaSignup }: { onCtaSignup: () => void }) {
  return (
    <section style={{ maxWidth: 1240, margin: "60px auto", padding: "0 32px" }}>
      <div
        className="lp-final"
        style={{
          borderRadius: 28,
          padding: "72px 56px",
          background: `linear-gradient(135deg, ${LT.primary} 0%, ${LT.primaryDeep} 70%, ${LT.ink} 100%)`,
          color: "white",
          position: "relative",
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: 40,
          alignItems: "center",
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
              fontSize: 60,
              fontWeight: 600,
              letterSpacing: -2,
              lineHeight: 1.0,
              margin: "0 0 18px",
            }}
          >
            Your floor is ready.
            <br />
            Open the door.
          </h2>
          <p
            style={{
              fontSize: 18,
              opacity: 0.85,
              maxWidth: 480,
              margin: "0 0 30px",
              lineHeight: 1.55,
            }}
          >
            Five minutes to a working community. 0% fees for 30 days. Stripe handled. No setup
            call, no AI sales bot.
          </p>
          <div
            className="lp-cta-row"
            style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}
          >
            <button
              onClick={onCtaSignup}
              style={{
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
              Create your community — free
            </button>
            <Link
              href="/discovery"
              style={{
                padding: "16px 22px",
                borderRadius: 12,
                background: "transparent",
                color: "white",
                fontWeight: 600,
                fontSize: 15,
                border: `1px solid rgba(255,255,255,0.35)`,
                textDecoration: "none",
              }}
            >
              Browse communities
            </Link>
          </div>
        </div>
        <div
          className="lp-final-phone"
          style={{ position: "relative", display: "flex", justifyContent: "center" }}
        >
          <div
            style={{
              width: 240,
              height: 480,
              borderRadius: 36,
              background: LT.ink,
              border: "8px solid hsl(270, 25%, 8%)",
              padding: 8,
              boxShadow: "0 30px 60px -20px rgba(0,0,0,0.5)",
              transform: "rotate(4deg)",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                borderRadius: 26,
                background: LT.bg,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px" }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: `linear-gradient(135deg, ${LT.primary}, ${LT.accent})`,
                  }}
                />
                <span style={{ fontSize: 11, fontWeight: 700, color: LT.fg }}>BachataFlow</span>
              </div>
              <div style={{ background: "white", borderRadius: 10, padding: 8, fontSize: 9 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    marginBottom: 4,
                  }}
                >
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: LT.secondary,
                    }}
                  />
                  <span style={{ fontWeight: 600, color: LT.fg }}>Marta · 2h</span>
                </div>
                <div style={{ fontWeight: 600, color: LT.fg, marginBottom: 2 }}>
                  Standing leg cue
                </div>
                <div style={{ color: LT.muted, lineHeight: 1.4 }}>
                  Stop saying push the floor away…
                </div>
              </div>
              <div
                style={{
                  background: LT.primary,
                  color: "white",
                  borderRadius: 10,
                  padding: 10,
                  fontSize: 9,
                }}
              >
                <div style={{ fontSize: 7, opacity: 0.8, letterSpacing: 1 }}>LIVE IN 14M</div>
                <div style={{ fontWeight: 700, fontSize: 11, marginTop: 2 }}>
                  Floorwork Wk 3
                </div>
                <div style={{ opacity: 0.8, marginTop: 1 }}>86 going</div>
              </div>
              <PhotoPlaceholder label="clip" h={88} radius={10} tone="warm" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 12. Footer ──
function FooterBlock() {
  return (
    <footer
      style={{ background: LT.ink, color: "rgba(255,255,255,0.7)", padding: "60px 0 40px" }}
    >
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 32px" }}>
        <div
          className="lp-foot-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr",
            gap: 40,
            marginBottom: 50,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <DHMark size={26} color="white" />
              <span
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: 18,
                  color: "white",
                }}
              >
                Dance-Hub
              </span>
            </div>
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                opacity: 0.7,
                margin: "0 0 18px",
                maxWidth: 280,
              }}
            >
              The community OS for dance teachers. Built in Estonia, used by floors in many
              corners.
            </p>
          </div>
          {(
            [
              ["Product", ["Community", "Classroom", "Live classes", "Private lessons"]],
              ["Discover", ["All communities", "Discover directory", "About", "Pricing"]],
              ["For teachers", ["Onboarding", "Pricing", "FAQ", "Contact"]],
              ["Company", ["Privacy", "Terms", "Support", "Status"]],
            ] as Array<[string, string[]]>
          ).map(([title, items], i) => (
            <div key={i}>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: "white",
                  fontWeight: 700,
                  marginBottom: 14,
                }}
              >
                {title}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 9,
                  fontSize: 13,
                }}
              >
                {items.map((it, k) => (
                  <span key={k}>{it}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            padding: "24px 0",
            borderTop: `1px solid rgba(255,255,255,0.12)`,
            borderBottom: `1px solid rgba(255,255,255,0.12)`,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "white",
              fontWeight: 700,
              marginBottom: 14,
            }}
          >
            Popular communities
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[
              "Bachata",
              "Salsa",
              "Kizomba",
              "Afro House",
              "Hip-Hop",
              "Contemporary",
              "Vogue",
              "Zouk",
              "Tango",
              "Cuban Son",
              "Forró",
              "Lindy Hop",
            ].map((c, i) => (
              <div
                key={i}
                style={{
                  padding: "7px 14px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.07)",
                  color: "white",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                {c}
              </div>
            ))}
          </div>
        </div>

        <div
          className="lp-foot-bottom"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12,
            opacity: 0.6,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>© {new Date().getFullYear()} Dance-Hub · Built in Estonia 🇪🇪</div>
          <div style={{ display: "flex", gap: 22 }}>
            <Link href="/terms" style={{ color: "inherit", textDecoration: "none" }}>
              Terms
            </Link>
            <Link href="/privacy" style={{ color: "inherit", textDecoration: "none" }}>
              Privacy
            </Link>
            <span>Accessibility</span>
            <span>Status</span>
          </div>
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
      {/* Responsive overrides — keep desktop fidelity, fall back gracefully on mobile. */}
      <style>{`
        .lp-h1 { font-size: 76px; }
        .lp-h2 { font-size: 48px; }
        @media (max-width: 1080px) {
          .lp-hero-app { grid-template-columns: 1fr !important; }
          .lp-hero-side, .lp-hero-rail { display: none !important; }
          .lp-foot-grid { grid-template-columns: 1.4fr 1fr 1fr !important; }
        }
        @media (max-width: 820px) {
          .lp-h1 { font-size: 44px !important; letter-spacing: -1.4px !important; }
          .lp-h2 { font-size: 30px !important; letter-spacing: -1px !important; }
          .lp-nav-links { display: none !important; }
          .lp-feature-row { flex-direction: column !important; gap: 24px !important; }
          .lp-feature-row > div { padding: 0 !important; max-width: 100% !important; }
          .lp-band { grid-template-columns: 1fr !important; padding: 36px 28px !important; }
          .lp-pricing-grid { grid-template-columns: 1fr !important; }
          .lp-final { grid-template-columns: 1fr !important; padding: 48px 28px !important; }
          .lp-final-phone { display: none !important; }
          .lp-letter { grid-template-columns: 1fr !important; }
          .lp-stats { grid-template-columns: repeat(2, 1fr) !important; gap: 24px 0 !important; }
          .lp-stats > div:nth-child(3) { border-left: none !important; }
          .lp-foot-grid { grid-template-columns: 1fr 1fr !important; }
          .lp-promo { font-size: 11px !important; padding: 8px 12px !important; }
          .lp-decoded h2.lp-h2, .lp-decoded h2 { font-size: 26px !important; }
        }
      `}</style>

      <PromoBanner />
      <Nav user={user} />
      <Hero onCtaSignup={onCtaSignup} />
      <DecodedBand />
      <FeatureRows />
      <BoldClaim />
      <CommunityBand />
      <Pricing onCtaSignup={onCtaSignup} />
      <FAQ />
      <FounderLetter />
      <FinalCTA onCtaSignup={onCtaSignup} />
      <FooterBlock />
    </div>
  );
}
