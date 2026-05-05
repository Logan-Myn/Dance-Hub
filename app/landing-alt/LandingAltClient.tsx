"use client";

import Link from "next/link";
import { CSSProperties, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";

// ViewStats-shaped landing — clean SaaS, off-white bg, orange accent, 3-col feature grid,
// one dark community band, all-caps section labels, pill CTAs.
const T = {
  bg: "hsl(30, 25%, 97%)",
  bgWarm: "hsl(30, 35%, 94%)",
  card: "hsl(0, 0%, 100%)",
  fg: "hsl(20, 15%, 12%)",
  fgSoft: "hsl(20, 12%, 30%)",
  muted: "hsl(20, 8%, 48%)",
  border: "hsl(30, 18%, 88%)",
  rule: "hsl(30, 18%, 92%)",
  primary: "hsl(18, 92%, 55%)",
  primaryDeep: "hsl(14, 85%, 42%)",
  primarySoft: "hsl(22, 90%, 95%)",
  ink: "hsl(20, 18%, 8%)",
  inkSoft: "hsl(20, 14%, 18%)",
  gold: "hsl(40, 95%, 58%)",
};

const FONT_DISPLAY = "var(--font-outfit), system-ui, sans-serif";
const FONT_BODY = "var(--font-figtree), system-ui, sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

// Tiny logo mark, kept consistent with the brand.
function DHMark({ size = 28, color }: { size?: number; color?: string }) {
  const c = color || T.primary;
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

type Tone = "warm" | "deep" | "ink" | "light";
function Mock({
  label,
  h = 200,
  radius = 14,
  tone = "warm",
  style = {},
}: {
  label: string;
  h?: number;
  radius?: number;
  tone?: Tone;
  style?: CSSProperties;
}) {
  const tones: Record<Tone, { a: string; b: string; ink: string }> = {
    warm: { a: "hsl(22, 60%, 88%)", b: "hsl(22, 50%, 80%)", ink: "hsl(22, 50%, 28%)" },
    deep: { a: "hsl(14, 65%, 45%)", b: "hsl(14, 60%, 35%)", ink: "hsl(14, 40%, 90%)" },
    ink: { a: "hsl(20, 20%, 14%)", b: "hsl(20, 20%, 10%)", ink: "hsl(20, 15%, 70%)" },
    light: { a: "hsl(30, 25%, 92%)", b: "hsl(30, 20%, 86%)", ink: "hsl(20, 18%, 38%)" },
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
      <span style={{ background: "rgba(255,255,255,0.35)", padding: "3px 8px", borderRadius: 4 }}>
        {label}
      </span>
    </div>
  );
}

// ── Promo bar ──
function PromoBar() {
  return (
    <div
      className="lp-promo"
      style={{
        background: T.ink,
        color: "white",
        padding: "10px 20px",
        textAlign: "center",
        fontSize: 13,
        letterSpacing: 0.2,
      }}
    >
      <span
        style={{
          background: T.primary,
          color: "white",
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
        <b style={{ color: T.gold }}>0% platform fees</b> for your first 30 days.
      </span>{" "}
      <Link
        href="/onboarding"
        style={{ color: T.primary, fontWeight: 600, textDecoration: "underline", marginLeft: 8 }}
      >
        Start now →
      </Link>
    </div>
  );
}

// ── Nav ──
function Nav({ user }: { user: unknown }) {
  const isAuthed = !!user;
  return (
    <nav
      className="lp-nav"
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "18px 32px",
        display: "flex",
        alignItems: "center",
        gap: 32,
      }}
    >
      <Link
        href="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          textDecoration: "none",
          color: T.fg,
        }}
      >
        <DHMark size={30} />
        <span
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: -0.4,
          }}
        >
          Dance-Hub
        </span>
        <span
          style={{
            background: T.primary,
            color: "white",
            fontFamily: FONT_MONO,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 1,
            padding: "2px 7px",
            borderRadius: 4,
            marginLeft: 4,
          }}
        >
          PRO
        </span>
      </Link>
      <div
        className="lp-nav-links"
        style={{ display: "flex", gap: 26, fontSize: 14, color: T.fgSoft, marginLeft: 24 }}
      >
        <Link href="/discovery" style={{ color: "inherit", textDecoration: "none" }}>
          Discover
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
              padding: "10px 20px",
              borderRadius: 999,
              background: T.primary,
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
              style={{ fontSize: 14, color: T.fgSoft, textDecoration: "none" }}
            >
              Log in
            </Link>
            <Link
              href="/onboarding"
              style={{
                padding: "10px 20px",
                borderRadius: 999,
                background: T.primary,
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

function Kicker({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: FONT_MONO,
        fontSize: 11,
        letterSpacing: 3,
        textTransform: "uppercase",
        color: T.primary,
        fontWeight: 700,
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

// ── Hero ──
function Hero({ onCtaSignup }: { onCtaSignup: () => void }) {
  return (
    <section
      className="lp-hero"
      style={{ maxWidth: 1180, margin: "0 auto", padding: "70px 32px 30px", textAlign: "center" }}
    >
      <Kicker>The community OS for dance teachers</Kicker>
      <h1
        className="lp-h1"
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 80,
          fontWeight: 700,
          letterSpacing: -3,
          lineHeight: 0.98,
          margin: "0 auto 22px",
          maxWidth: 1000,
          color: T.ink,
        }}
      >
        Run a paid dance community
        <br />
        students <span style={{ color: T.primary }}>actually open</span> every week.
      </h1>
      <p
        style={{
          fontSize: 18,
          lineHeight: 1.55,
          color: T.fgSoft,
          maxWidth: 660,
          margin: "0 auto 36px",
        }}
      >
        Threads, courses, live classes, and 1-on-1 lessons. One place to host your floor, get
        paid, and keep the relationship with your students.
      </p>
      <div
        className="lp-cta-row"
        style={{
          display: "flex",
          gap: 12,
          justifyContent: "center",
          marginBottom: 22,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={onCtaSignup}
          style={{
            padding: "16px 28px",
            borderRadius: 999,
            border: "none",
            background: T.primary,
            color: "white",
            fontWeight: 700,
            fontSize: 15,
            cursor: "pointer",
            boxShadow: `0 14px 30px -10px ${T.primary}`,
          }}
        >
          Sign up. Free for 30 days.
        </button>
        <Link
          href="/discovery"
          style={{
            padding: "16px 24px",
            borderRadius: 999,
            background: "white",
            color: T.fg,
            fontWeight: 600,
            fontSize: 15,
            border: `1px solid ${T.border}`,
            textDecoration: "none",
          }}
        >
          Browse communities
        </Link>
      </div>
      <div style={{ fontSize: 13, color: T.muted, marginBottom: 56 }}>
        No card. 5-minute setup. Cancel any time.
      </div>

      <HeroImage />
    </section>
  );
}

// Big banner-style hero image: a wide product shot.
function HeroImage() {
  return (
    <div
      className="lp-hero-img"
      style={{
        position: "relative",
        maxWidth: 1180,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          borderRadius: 24,
          overflow: "hidden",
          background: T.card,
          border: `1px solid ${T.border}`,
          boxShadow:
            "0 50px 100px -40px rgba(60,30,10,0.30), 0 8px 18px -6px rgba(60,30,10,0.08)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "12px 18px",
            borderBottom: `1px solid ${T.rule}`,
            background: T.bgWarm,
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
          <span
            style={{
              marginLeft: 16,
              fontSize: 12,
              color: T.muted,
              fontFamily: FONT_MONO,
            }}
          >
            dance-hub.io/c/bachataflow
          </span>
        </div>
        <div
          className="lp-hero-app"
          style={{
            display: "grid",
            gridTemplateColumns: "200px 1fr 240px",
            minHeight: 480,
          }}
        >
          <div
            className="lp-hero-side"
            style={{
              padding: 16,
              borderRight: `1px solid ${T.rule}`,
              background: T.bg,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
                padding: 8,
                borderRadius: 10,
                background: T.card,
                border: `1px solid ${T.border}`,
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  background: `linear-gradient(135deg, ${T.primary}, ${T.gold})`,
                }}
              />
              <div style={{ fontSize: 12, fontWeight: 700 }}>BachataFlow</div>
            </div>
            {(
              [
                ["Community", true],
                ["Classroom", false],
                ["Calendar", false],
                ["Members", false],
                ["About", false],
              ] as Array<[string, boolean]>
            ).map(([label, on], i) => (
              <div
                key={i}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  fontSize: 13,
                  background: on ? T.primarySoft : "transparent",
                  color: on ? T.primaryDeep : T.muted,
                  fontWeight: on ? 600 : 500,
                }}
              >
                {label}
              </div>
            ))}
          </div>
          <div style={{ padding: 22, background: T.card }}>
            <div
              style={{
                borderRadius: 14,
                marginBottom: 18,
                background: `linear-gradient(135deg, ${T.primary} 0%, ${T.primaryDeep} 100%)`,
                padding: "20px 22px",
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
                    fontWeight: 700,
                    fontSize: 22,
                    letterSpacing: -0.6,
                  }}
                >
                  Bachata · Floorwork Wk 3
                </div>
                <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>
                  Live in 14 minutes · 86 going
                </div>
              </div>
              <div
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  background: "white",
                  color: T.primaryDeep,
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
                color: T.primary,
                time: "2h",
                title: "Grounding through the standing leg",
                body: "I used to tell students 'push the floor away.' I now think this language is actively…",
                reactions: 24,
                replies: 8,
              },
              {
                name: "Kofi A.",
                initial: "K",
                color: T.gold,
                time: "5h",
                title: "Shoulder tension drill. 4 mins, no music",
                body: "Filmed this morning before class. Adapted from a Cuban son teacher in Havana, for…",
                reactions: 41,
                replies: 12,
              },
            ].map((p, i) => (
              <div
                key={i}
                style={{
                  border: `1px solid ${T.border}`,
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 10,
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}
                >
                  <div
                    style={{
                      width: 26,
                      height: 26,
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
                  <span style={{ fontSize: 11, color: T.muted }}>· {p.time}</span>
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
                <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>{p.body}</div>
                <div style={{ display: "flex", gap: 14, fontSize: 11, color: T.muted, marginTop: 8 }}>
                  <span>♥ {p.reactions}</span>
                  <span>↩ {p.replies}</span>
                </div>
              </div>
            ))}
          </div>
          <div
            className="lp-hero-rail"
            style={{
              padding: 18,
              borderLeft: `1px solid ${T.rule}`,
              background: T.bg,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: T.muted,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                marginBottom: 10,
                fontWeight: 700,
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
                border: `1px solid ${T.border}`,
              }}
            >
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>Net revenue</div>
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
                style={{ fontSize: 11, color: "hsl(145, 55%, 40%)", fontWeight: 600, marginTop: 2 }}
              >
                ▲ 18% vs last month
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  alignItems: "flex-end",
                  height: 36,
                  marginTop: 12,
                }}
              >
                {[40, 52, 48, 56, 62, 70, 80].map((h, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${h}%`,
                      borderRadius: 3,
                      background: i >= 5 ? T.primary : `${T.primary}55`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Video band ──
function VideoBand() {
  return (
    <section
      style={{
        maxWidth: 1180,
        margin: "70px auto 30px",
        padding: "0 32px",
        textAlign: "center",
      }}
    >
      <h2
        className="lp-h2"
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 40,
          fontWeight: 700,
          letterSpacing: -1.4,
          lineHeight: 1.1,
          margin: "0 auto 32px",
          maxWidth: 760,
        }}
      >
        Built ground-up for dance teachers.
      </h2>
      <div
        style={{
          position: "relative",
          maxWidth: 920,
          margin: "0 auto",
          borderRadius: 22,
          overflow: "hidden",
          aspectRatio: "16/9",
          background: `linear-gradient(135deg, ${T.ink}, ${T.inkSoft})`,
          boxShadow: "0 30px 80px -25px rgba(60,30,10,0.45)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.18,
            background: `repeating-linear-gradient(135deg, transparent 0 18px, ${T.primary} 18px 19px)`,
          }}
        />
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
              background: T.primary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 16px 36px rgba(0,0,0,0.35)",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: 0,
                height: 0,
                marginLeft: 7,
                borderLeft: "26px solid white",
                borderTop: "16px solid transparent",
                borderBottom: "16px solid transparent",
              }}
            />
          </div>
        </div>
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
            opacity: 0.85,
          }}
        >
          02:14 · Product tour
        </div>
      </div>
    </section>
  );
}

// ── Feature grid (3-col, ViewStats-style) ──
type Feature = {
  label: string;
  title: string;
  body: string;
  tone: Tone;
};
const FEATURES: Feature[] = [
  {
    label: "Community",
    title: "Threads, replies, reactions",
    body: "A feed your students actually open. Threaded discussions, categories per topic, pinned posts. The relationship stays yours.",
    tone: "warm",
  },
  {
    label: "Classroom",
    title: "Courses with chapters & progress",
    body: "Upload videos, organize them into chapters and lessons. Students mark their way through. Plays smoothly on phone, tablet, laptop.",
    tone: "light",
  },
  {
    label: "Live classes",
    title: "Stream live from the browser",
    body: "Schedule on the calendar. Hit go-live in your community. Browser-based video rooms with chat, screen-share, and hand-raise.",
    tone: "deep",
  },
  {
    label: "Private lessons",
    title: "1-on-1, booked and paid",
    body: "Set your hourly rate, set your availability, share the link. Students book and pay before they show up. You get a calendar event and a paid booking.",
    tone: "warm",
  },
  {
    label: "Memberships",
    title: "Up to 96% goes to you",
    body: "0% platform fees for your first 30 days. After that, 8% under 50 members, 6% to 100, 4% beyond. Weekly or monthly payouts to your bank.",
    tone: "light",
  },
  {
    label: "Discovery",
    title: "A directory that brings students in",
    body: "Every community on Dance-Hub is listed in our public directory. Free traffic to teachers who keep their members happy.",
    tone: "ink",
  },
];

function Features() {
  return (
    <section
      id="features"
      style={{ maxWidth: 1180, margin: "70px auto", padding: "0 32px" }}
    >
      <div style={{ textAlign: "center", marginBottom: 44 }}>
        <Kicker>Everything in one place</Kicker>
        <h2
          className="lp-h2"
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 48,
            fontWeight: 700,
            letterSpacing: -1.6,
            lineHeight: 1.05,
            margin: 0,
            color: T.ink,
          }}
        >
          The toolkit for teachers
          <br />
          running a paid floor
        </h2>
      </div>

      <div
        className="lp-features-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 22,
        }}
      >
        {FEATURES.map((f, i) => (
          <div
            key={i}
            style={{
              background: T.card,
              border: `1px solid ${T.border}`,
              borderRadius: 18,
              padding: 22,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <Mock label={`${f.label.toLowerCase()} · screenshot`} h={180} radius={12} tone={f.tone} />
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 11,
                letterSpacing: 2.5,
                textTransform: "uppercase",
                color: T.primary,
                fontWeight: 700,
              }}
            >
              {f.label}
            </div>
            <h3
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: -0.6,
                lineHeight: 1.2,
                margin: 0,
                color: T.ink,
              }}
            >
              {f.title}
            </h3>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: T.fgSoft, margin: 0 }}>{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Differentiator (bold claim, no decoration) ──
function Differentiator() {
  return (
    <section style={{ maxWidth: 980, margin: "100px auto 60px", padding: "0 32px", textAlign: "center" }}>
      <Kicker>Why teachers pick Dance-Hub</Kicker>
      <h2
        className="lp-h2"
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 56,
          fontWeight: 700,
          letterSpacing: -2,
          lineHeight: 1.0,
          margin: "0 0 24px",
          color: T.ink,
        }}
      >
        Built for the floor.
      </h2>
      <p
        style={{
          fontSize: 19,
          lineHeight: 1.55,
          color: T.fgSoft,
          maxWidth: 660,
          margin: "0 auto",
        }}
      >
        The platform is shaped like the way teachers actually run a community: feed, classroom,
        live class, private lesson, payout. In one place, under your brand.
      </p>
    </section>
  );
}

// ── Dark community band ──
function DarkBand() {
  return (
    <section
      style={{
        background: T.ink,
        color: "white",
        padding: "80px 0",
        margin: "60px 0",
      }}
    >
      <div
        className="lp-dark"
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "0 32px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 56,
          alignItems: "center",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: T.gold,
              fontWeight: 700,
              marginBottom: 14,
            }}
          >
            Teachers&apos; room
          </div>
          <h2
            className="lp-h2"
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 44,
              fontWeight: 700,
              letterSpacing: -1.4,
              lineHeight: 1.05,
              margin: "0 0 20px",
            }}
          >
            Build alongside other teachers.
          </h2>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.6,
              opacity: 0.78,
              maxWidth: 460,
              margin: "0 0 24px",
            }}
          >
            Every paying teacher gets a seat in our private space for working teachers: pricing
            playbooks, retention tactics, monthly office hours, a direct line to the team.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {["Pricing playbooks", "Office hours", "Direct line to the team", "Beta access"].map(
              (p, i) => (
                <div
                  key={i}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.08)",
                    color: "white",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {p}
                </div>
              )
            )}
          </div>
        </div>
        <div>
          <Mock label="teachers' room · screenshot" h={320} radius={16} tone="ink" />
        </div>
      </div>
    </section>
  );
}

// ── Big CTA banner ──
function BigCTA({ onCtaSignup }: { onCtaSignup: () => void }) {
  return (
    <section
      style={{ maxWidth: 1100, margin: "60px auto", padding: "0 32px", textAlign: "center" }}
    >
      <h2
        className="lp-h2"
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 64,
          fontWeight: 700,
          letterSpacing: -2.2,
          lineHeight: 1.0,
          margin: "0 0 28px",
          color: T.ink,
        }}
      >
        Your next class
        <br />
        should be <span style={{ color: T.primary }}>packed.</span>
      </h2>
      <button
        onClick={onCtaSignup}
        style={{
          padding: "18px 32px",
          borderRadius: 999,
          border: "none",
          background: T.primary,
          color: "white",
          fontWeight: 700,
          fontSize: 16,
          cursor: "pointer",
          boxShadow: `0 16px 36px -12px ${T.primary}`,
        }}
      >
        Get started. Free for 30 days.
      </button>
    </section>
  );
}

// ── Pricing ──
function Pricing({ onCtaSignup }: { onCtaSignup: () => void }) {
  return (
    <section id="pricing" style={{ maxWidth: 1100, margin: "100px auto 60px", padding: "0 32px" }}>
      <div style={{ textAlign: "center", marginBottom: 44 }}>
        <Kicker>Pricing</Kicker>
        <h2
          className="lp-h2"
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 48,
            fontWeight: 700,
            letterSpacing: -1.6,
            lineHeight: 1.05,
            margin: "0 0 14px",
            color: T.ink,
          }}
        >
          One plan. Honest fees.
        </h2>
        <p style={{ fontSize: 16, color: T.fgSoft, maxWidth: 540, margin: "0 auto" }}>
          Free for 30 days. After that, a small share of revenue that drops as you grow.
        </p>
      </div>
      <div className="lp-pricing-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
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
          subtitle="Card processing fees are on top, same as anywhere."
          features={[
            "Under 50 paying members. 8%",
            "50 to 100 members. 6%",
            "Over 100 members. 4%",
            "Payouts: weekly or monthly, your call",
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
        borderRadius: 22,
        padding: "34px 32px 28px",
        background: highlight ? T.ink : T.card,
        color: highlight ? "white" : T.fg,
        border: highlight ? "none" : `1px solid ${T.border}`,
        boxShadow: highlight
          ? `0 24px 60px -22px rgba(0,0,0,0.4)`
          : "0 8px 24px -16px rgba(60,30,10,0.08)",
        position: "relative",
      }}
    >
      {highlight && (
        <div
          style={{
            position: "absolute",
            top: 22,
            right: 22,
            padding: "5px 12px",
            borderRadius: 999,
            background: T.primary,
            color: "white",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          First 30 days
        </div>
      )}
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 11,
          letterSpacing: 2.5,
          textTransform: "uppercase",
          opacity: highlight ? 0.8 : 0.55,
          marginBottom: 14,
          fontWeight: 700,
        }}
      >
        {tier}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 14 }}>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: -1.6,
            lineHeight: 1,
            color: highlight ? "white" : T.ink,
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
          opacity: highlight ? 0.85 : 1,
          color: highlight ? "white" : T.fgSoft,
        }}
      >
        {subtitle}
      </p>
      <button
        onClick={onCta}
        style={{
          width: "100%",
          padding: "14px 18px",
          borderRadius: 999,
          background: highlight ? T.primary : T.ink,
          color: "white",
          border: "none",
          fontWeight: 700,
          fontSize: 14,
          cursor: "pointer",
          marginBottom: 22,
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
                background: highlight ? "rgba(255,255,255,0.15)" : T.primarySoft,
                color: highlight ? "white" : T.primary,
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

// ── FAQ ──
const FAQS = [
  {
    q: "How is Dance-Hub different from Skool, Patreon or Discord?",
    a: "Skool is built for online business courses. Patreon for podcasters and artists. Discord is a chat app. Dance-Hub does what dance teachers actually need: a feed, a classroom, live classes, paid 1-on-1 lessons, and the membership and payout machinery underneath, all in one place.",
  },
  {
    q: "What does it cost?",
    a: "0% platform fees for the first 30 days. After that we take a share of revenue that drops as you grow: 8% under 50 members, 6% to 100, 4% above. No setup fee, no monthly seat fee.",
  },
  {
    q: "Can I import my videos?",
    a: "Yes. Drag-and-drop upload to any chapter. We host and transcode for you, so the same file plays smoothly on phones, tablets, and laptops without you thinking about formats.",
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
    <section id="faq" style={{ maxWidth: 880, margin: "60px auto", padding: "0 32px" }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <Kicker>FAQ</Kicker>
        <h2
          className="lp-h2"
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: -1.4,
            lineHeight: 1,
            margin: 0,
            color: T.ink,
          }}
        >
          Questions teachers ask
        </h2>
      </div>
      <div style={{ borderTop: `1px solid ${T.border}` }}>
        {FAQS.map((f, i) => (
          <details
            key={i}
            style={{ borderBottom: `1px solid ${T.border}`, padding: "20px 4px" }}
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
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: T.primarySoft,
                  color: T.primary,
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
                color: T.fgSoft,
                marginTop: 12,
                maxWidth: 740,
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

// ── Founder note ──
function Founder() {
  return (
    <section style={{ background: T.bgWarm, padding: "80px 0", margin: "60px 0" }}>
      <div
        className="lp-letter"
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "0 32px",
          display: "grid",
          gridTemplateColumns: "1.1fr 1fr",
          gap: 56,
          alignItems: "center",
        }}
      >
        <div>
          <Kicker>A note from the team</Kicker>
          <h2
            className="lp-h2"
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 38,
              fontWeight: 700,
              letterSpacing: -1.2,
              lineHeight: 1.1,
              margin: "0 0 22px",
              color: T.ink,
            }}
          >
            Built by people who got tired of gluing five tools together every Sunday.
          </h2>
          <div style={{ fontSize: 16, lineHeight: 1.7, color: T.fgSoft, marginBottom: 18 }}>
            <p style={{ margin: "0 0 14px" }}>Hey teachers,</p>
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
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 18, color: T.ink }}>
            The Dance-Hub team
          </div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
            Built in Estonia 🇪🇪
          </div>
        </div>
        <div>
          <Mock label="studio · founders" h={420} radius={20} tone="warm" />
        </div>
      </div>
    </section>
  );
}

// ── Final CTA with phone ──
function FinalCTA({ onCtaSignup }: { onCtaSignup: () => void }) {
  return (
    <section style={{ maxWidth: 1180, margin: "60px auto", padding: "0 32px" }}>
      <div
        className="lp-final"
        style={{
          borderRadius: 28,
          padding: "70px 56px",
          background: `linear-gradient(135deg, ${T.primary} 0%, ${T.primaryDeep} 70%, ${T.ink} 100%)`,
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
              fontSize: 56,
              fontWeight: 700,
              letterSpacing: -2,
              lineHeight: 1.0,
              margin: "0 0 18px",
            }}
          >
            Your floor is ready.
            <br />
            Open the door.
          </h2>
          <p style={{ fontSize: 17, opacity: 0.88, maxWidth: 460, margin: "0 0 28px", lineHeight: 1.55 }}>
            Five minutes to a working community. Free for 30 days. Cancel any time.
          </p>
          <div className="lp-cta-row" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              onClick={onCtaSignup}
              style={{
                padding: "16px 28px",
                borderRadius: 999,
                border: "none",
                background: "white",
                color: T.primaryDeep,
                fontWeight: 700,
                fontSize: 16,
                cursor: "pointer",
              }}
            >
              Sign up. Free for 30 days.
            </button>
            <Link
              href="/discovery"
              style={{
                padding: "16px 24px",
                borderRadius: 999,
                background: "transparent",
                color: "white",
                fontWeight: 600,
                fontSize: 15,
                border: `1px solid rgba(255,255,255,0.4)`,
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
              width: 230,
              height: 460,
              borderRadius: 36,
              background: T.ink,
              border: "8px solid hsl(20, 25%, 5%)",
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
                background: T.bg,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px" }}>
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: `linear-gradient(135deg, ${T.primary}, ${T.gold})`,
                  }}
                />
                <span style={{ fontSize: 11, fontWeight: 700, color: T.fg }}>BachataFlow</span>
              </div>
              <div style={{ background: "white", borderRadius: 10, padding: 8, fontSize: 9 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                  <div
                    style={{ width: 14, height: 14, borderRadius: "50%", background: T.primary }}
                  />
                  <span style={{ fontWeight: 600, color: T.fg }}>Marta · 2h</span>
                </div>
                <div style={{ fontWeight: 600, color: T.fg, marginBottom: 2 }}>
                  Standing leg cue
                </div>
                <div style={{ color: T.muted, lineHeight: 1.4 }}>
                  Stop saying push the floor away…
                </div>
              </div>
              <div
                style={{
                  background: T.primary,
                  color: "white",
                  borderRadius: 10,
                  padding: 10,
                  fontSize: 9,
                }}
              >
                <div style={{ fontSize: 7, opacity: 0.85, letterSpacing: 1 }}>LIVE IN 14M</div>
                <div style={{ fontWeight: 700, fontSize: 11, marginTop: 2 }}>Floorwork Wk 3</div>
                <div style={{ opacity: 0.85, marginTop: 1 }}>86 going</div>
              </div>
              <Mock label="clip" h={88} radius={10} tone="warm" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Footer ──
function FooterBlock() {
  return (
    <footer style={{ background: T.ink, color: "rgba(255,255,255,0.7)", padding: "56px 0 36px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 32px" }}>
        <div
          className="lp-foot-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr",
            gap: 36,
            marginBottom: 44,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <DHMark size={26} color="white" />
              <span
                style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 18, color: "white" }}
              >
                Dance-Hub
              </span>
            </div>
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                opacity: 0.7,
                margin: "0 0 16px",
                maxWidth: 280,
              }}
            >
              The community OS for dance teachers. Built in Estonia.
            </p>
          </div>
          {(
            [
              ["Product", ["Community", "Classroom", "Live classes", "Private lessons"]],
              ["Discover", ["All communities", "By style", "By city", "Pricing"]],
              ["For teachers", ["Onboarding", "FAQ", "Contact", "Roadmap"]],
              ["Company", ["Privacy", "Terms", "Status", "Support"]],
            ] as Array<[string, string[]]>
          ).map(([title, items], i) => (
            <div key={i}>
              <div
                style={{
                  fontFamily: FONT_MONO,
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
                style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 13 }}
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
            padding: "20px 0",
            borderTop: `1px solid rgba(255,255,255,0.12)`,
            borderBottom: `1px solid rgba(255,255,255,0.12)`,
            marginBottom: 22,
          }}
        >
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "white",
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            Top categories
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.07)",
                  color: "white",
                  fontSize: 12,
                }}
              >
                {c}
              </div>
            ))}
          </div>
        </div>

        <div
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
            <span>Status</span>
          </div>
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
    <div
      style={{
        background: T.bg,
        color: T.fg,
        fontFamily: FONT_BODY,
        overflowX: "hidden",
      }}
    >
      <style>{`
        .lp-h1 { font-size: 80px; }
        .lp-h2 { font-size: 48px; }
        @media (max-width: 1080px) {
          .lp-features-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .lp-hero-app { grid-template-columns: 1fr !important; }
          .lp-hero-side, .lp-hero-rail { display: none !important; }
          .lp-foot-grid { grid-template-columns: 1.4fr 1fr 1fr !important; }
        }
        @media (max-width: 820px) {
          .lp-h1 { font-size: 46px !important; letter-spacing: -1.4px !important; }
          .lp-h2 { font-size: 30px !important; letter-spacing: -1px !important; }
          .lp-nav-links { display: none !important; }
          .lp-features-grid { grid-template-columns: 1fr !important; }
          .lp-dark { grid-template-columns: 1fr !important; }
          .lp-pricing-grid { grid-template-columns: 1fr !important; }
          .lp-final { grid-template-columns: 1fr !important; padding: 48px 28px !important; }
          .lp-final-phone { display: none !important; }
          .lp-letter { grid-template-columns: 1fr !important; }
          .lp-foot-grid { grid-template-columns: 1fr 1fr !important; }
          .lp-promo { font-size: 11px !important; padding: 8px 12px !important; }
        }
      `}</style>

      <PromoBar />
      <Nav user={user} />
      <Hero onCtaSignup={onCtaSignup} />
      <VideoBand />
      <Features />
      <Differentiator />
      <DarkBand />
      <BigCTA onCtaSignup={onCtaSignup} />
      <Pricing onCtaSignup={onCtaSignup} />
      <FAQ />
      <Founder />
      <FinalCTA onCtaSignup={onCtaSignup} />
      <FooterBlock />
    </div>
  );
}
