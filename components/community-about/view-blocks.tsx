"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { BookOpen, CalendarDays, ChevronDown, GraduationCap, MessageCircle, Play, Quote, Users, Video } from "lucide-react";
import { BTN_SECONDARY } from "@/components/community-feed/feed-header";
import { DateTile } from "@/components/ds/date-tile";
import { InitialsAvatar } from "@/components/ds/initials-avatar";
import { CourseCover } from "@/components/community-classroom/course-cover";
import { clock } from "@/components/community-calendar/format";
import type { AboutData } from "@/lib/about/data";
import { AUTO_INFO, WRITTEN_INFO, isAuto, type AboutBlock, type FaqItem, type Offered } from "@/lib/about/blocks";
import { describeCancellationPolicy, euro } from "@/lib/private-lessons/policy";
import { communityPath } from "@/lib/safe-redirect";
import { relativeDayWord } from "@/lib/time/format";
import { cn } from "@/lib/utils";

const MuxPlayer = dynamic(() => import("@/components/MuxPlayer").then((m) => m.MuxPlayer), { ssr: false });

export interface AboutCtx {
  slug: string;
  communityName: string;
  teacher: { id: string; name: string; avatarUrl: string | null };
  offered: Offered;
  data: AboutData;
  pricing: { paid: boolean; monthly: number; yearly: number | null };
  timeZone: string;
  now: Date;
}

const CARD = "rounded-2xl border border-line bg-surface";

export function blockHeading(b: AboutBlock): string {
  if (b.title) return b.title;
  if (isAuto(b.type)) return AUTO_INFO[b.type].name;
  if (b.type === "teacher") return "Your teacher";
  if (b.type === "quote") return "";
  return "";
}

function Heading({ text, sub }: { text: string; sub?: string }) {
  if (!text) return null;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="text-balance font-display text-[22px] font-semibold tracking-[-0.01em] text-ink">{text}</h2>
      {sub && <p className="text-[14px] text-ink-3">{sub}</p>}
    </div>
  );
}

/** Automatic FAQ answers from the community's settings, then the owner's own. */
export function faqItems(ctx: AboutCtx, own: FaqItem[]): FaqItem[] {
  const out: FaqItem[] = [];
  const { pricing, offered, data } = ctx;
  if (pricing.paid) {
    const yearly = pricing.yearly ? `, or ${euro(pricing.yearly)} a year (you save ${euro(pricing.monthly * 12 - pricing.yearly)})` : "";
    out.push({ q: "How much does it cost?", a: `${euro(pricing.monthly)} a month${yearly}. Cancel anytime: you keep access until the end of the period you paid for.` });
  } else {
    out.push({ q: "How much does it cost?", a: "Joining is free. You only pay for private lessons, if you book one." });
  }
  if (offered.liveClasses && offered.courses && (data.course?.replayCount ?? 0) > 0) {
    out.push({ q: "Can I watch a class later?", a: "Yes. Live classes are recorded, and the replays land in the Classroom." });
  }
  if (offered.privateLessons && data.lessons.length) {
    const l = data.lessons[0];
    out.push({ q: "How do private lessons work?", a: `Pick a time on the Private lessons page and pay for that lesson. ${describeCancellationPolicy(l.cutoffHours, l.latePolicy)}` });
  }
  const parts = ["the community feed", offered.courses && "the Classroom", offered.liveClasses && "the live class calendar"].filter(Boolean) as string[];
  out.push({
    q: "What happens after I join?",
    a: `You get ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0]}. Introduce yourself in the feed, it's the best place to start.`,
  });
  return [...own.filter((i) => i.q && i.a), ...out];
}

/** Whether an automatic block has something to show (empty ones are hidden from visitors). */
export function autoHasData(b: AboutBlock, ctx: AboutCtx): boolean {
  switch (b.type) {
    case "schedule":
      return ctx.offered.liveClasses && ctx.data.upcoming.length > 0;
    case "course":
      return ctx.offered.courses && !!ctx.data.course;
    case "lessons":
      return ctx.offered.privateLessons && ctx.data.lessons.length > 0;
    case "activity":
      return ctx.data.activity.posts30 + ctx.data.activity.replies30 > 0;
    default:
      return true;
  }
}

export function ViewBlock({ block, ctx }: { block: AboutBlock; ctx: AboutCtx }) {
  const c = block.content;
  const heading = blockHeading(block);
  switch (block.type) {
    case "included": {
      const items = [
        ctx.offered.liveClasses && {
          icon: Video,
          title: "Live classes",
          text: ctx.data.upcoming.length ? `Join from home, with ${ctx.teacher.name}.` : "Scheduled in the calendar.",
          fact: ctx.data.upcoming.length ? `Next: ${relativeDayWord(ctx.data.upcoming[0].startsAt, ctx.now, ctx.timeZone, "en-GB")} at ${clock(ctx.data.upcoming[0].startsAt, ctx.timeZone)}` : null,
        },
        ctx.offered.courses && ctx.data.course && {
          icon: BookOpen,
          title: "Courses",
          text: "Learn step by step, at your own pace.",
          fact: `${ctx.data.courseCount} ${ctx.data.courseCount === 1 ? "course" : "courses"}${ctx.data.course.replayCount ? ` and ${ctx.data.course.replayCount} class replays` : ""}`,
        },
        ctx.offered.privateLessons && ctx.data.lessons.length > 0 && {
          icon: GraduationCap,
          title: "Private lessons",
          text: `One on one with ${ctx.teacher.name}.`,
          fact: (() => {
            const member = ctx.data.lessons.filter((l) => l.memberPrice != null).map((l) => l.memberPrice!);
            return member.length ? `Member price from ${euro(Math.min(...member))}` : `From ${euro(Math.min(...ctx.data.lessons.map((l) => l.regularPrice)))}`;
          })(),
        },
        {
          icon: MessageCircle,
          title: "The community",
          text: "Ask questions, share progress, get feedback.",
          fact: `${ctx.data.memberCount} ${ctx.data.memberCount === 1 ? "member" : "members"}${ctx.data.activity.posts30 ? `, ${ctx.data.activity.posts30} posts this month` : ""}`,
        },
      ].filter(Boolean) as Array<{ icon: typeof Video; title: string; text: string; fact: string | null }>;
      return (
        <>
          <Heading text={heading} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((i) => (
              <div key={i.title} className={cn(CARD, "flex flex-col gap-2 px-[18px] py-4")}>
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand-soft text-brand-ink">
                    <i.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                  </span>
                  <h3 className="font-display text-[16px] font-semibold text-ink">{i.title}</h3>
                </div>
                <p className="text-[14px] text-ink-2">{i.text}</p>
                {i.fact && <p className="text-[13.5px] font-semibold tabular-nums text-ink">{i.fact}</p>}
              </div>
            ))}
          </div>
        </>
      );
    }
    case "schedule":
      return (
        <>
          <Heading text={heading} sub="Times in your time zone" />
          <div className={cn(CARD, "divide-y divide-line overflow-hidden")}>
            {ctx.data.upcoming.map((u) => (
              <div key={u.id} className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-3.5 px-4 py-3">
                <DateTile date={u.startsAt} timeZone={ctx.timeZone} />
                <div className="min-w-0">
                  <strong className="block truncate text-[15px] text-ink">{u.title}</strong>
                  <span className="text-[13px] tabular-nums text-ink-3">
                    {relativeDayWord(u.startsAt, ctx.now, ctx.timeZone, "en-GB")} at {clock(u.startsAt, ctx.timeZone)}, {u.durationMinutes} min
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      );
    case "course": {
      const course = ctx.data.course!;
      return (
        <>
          <Heading text={heading} />
          <div className={cn(CARD, "overflow-hidden")}>
            <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-4 border-b border-line p-3.5 sm:grid-cols-[120px_minmax(0,1fr)]">
              <div className="aspect-[3/2] overflow-hidden rounded-[10px]">
                <CourseCover id={course.slug} title={course.title} coverUrl={course.coverUrl} />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-[17px] font-semibold text-ink">{course.title}</h3>
                <p className="mt-0.5 text-[13.5px] text-ink-2">
                  {course.lessonCount} {course.lessonCount === 1 ? "lesson" : "lessons"} in {course.chapters.length}{" "}
                  {course.chapters.length === 1 ? "chapter" : "chapters"}
                </p>
              </div>
            </div>
            <ol>
              {course.chapters.map((ch, i) => (
                <li key={`${ch.title}-${i}`} className="flex items-center gap-3 border-t border-line px-4 py-[11px] text-[14.5px] first:border-t-0">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 text-[12px] font-bold tabular-nums text-ink-2">{i + 1}</span>
                  <strong className="min-w-0 flex-1 truncate font-semibold text-ink">{ch.title}</strong>
                  <span className="whitespace-nowrap text-[13px] text-ink-3">
                    {ch.lessons} {ch.lessons === 1 ? "lesson" : "lessons"}
                  </span>
                  {i === 0 && course.previewLessonId && (
                    <Link
                      href={`${communityPath(ctx.slug, `/classroom/${encodeURIComponent(course.slug)}`)}?lesson=${course.previewLessonId}`}
                      className="inline-flex h-[30px] items-center gap-1.5 rounded-lg bg-brand-soft px-2.5 text-[13px] font-bold text-brand-ink hover:bg-brand/15"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                      Watch free
                    </Link>
                  )}
                </li>
              ))}
            </ol>
            {course.replayCount > 0 && (
              <p className="flex items-center gap-3 border-t border-line bg-surface-2 px-4 py-3 text-[14px] text-ink-2">
                <Video className="h-4 w-4 text-ink-3" aria-hidden="true" />
                Plus replays of {course.replayCount} live {course.replayCount === 1 ? "class" : "classes"}.
              </p>
            )}
          </div>
        </>
      );
    }
    case "lessons":
      return (
        <>
          <Heading text={heading} />
          <div className={cn(CARD, "divide-y divide-line overflow-hidden")}>
            {ctx.data.lessons.map((l) => (
              <Link
                key={l.id}
                href={communityPath(ctx.slug, "/private-lessons")}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0">
                  <strong className="block truncate text-[15px] text-ink">{l.title}</strong>
                  <span className="text-[13px] text-ink-3">
                    {l.durationMinutes} min
                    {l.nextFree
                      ? `, next free ${new Date(l.nextFree).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: ctx.timeZone })} at ${clock(l.nextFree, ctx.timeZone)}`
                      : ", no open times right now"}
                  </span>
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <b className="block text-[15px] text-ink">{euro(l.memberPrice ?? l.regularPrice)}</b>
                  {l.memberPrice != null && (
                    <span className="text-[12px] text-ink-3">
                      members, <s>{euro(l.regularPrice)}</s>
                    </span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        </>
      );
    case "activity": {
      const a = ctx.data.activity;
      return (
        <>
          <Heading text={heading} />
          <div className={cn(CARD, "flex flex-col gap-3 p-[18px]")}>
            <div className="flex flex-wrap gap-x-7 gap-y-2.5">
              {[
                [ctx.data.memberCount, "members"],
                [a.posts30, "posts this month"],
                [a.replies30, "replies this month"],
              ].map(([n, label]) => (
                <div key={String(label)} className="flex flex-col">
                  <b className="font-display text-[26px] font-semibold leading-tight tabular-nums text-ink">{n}</b>
                  <span className="text-[13px] text-ink-2">{label}</span>
                </div>
              ))}
            </div>
            {a.topics.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {a.topics.map((t) => (
                  <span key={t.name} className="inline-flex h-[30px] items-center gap-[7px] rounded-full border border-line px-[11px] text-[13.5px] font-medium text-ink-2">
                    <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.name}
                    <span className="text-[12.5px] tabular-nums text-ink-3">{t.count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </>
      );
    }
    case "faq":
      return (
        <>
          <Heading text={heading} />
          <div className={cn(CARD, "divide-y divide-line overflow-hidden")}>
            {faqItems(ctx, c.items ?? []).map((i) => (
              <details key={i.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-[18px] py-[15px] text-[15.5px] font-semibold text-ink transition-colors hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                  {i.q}
                  <ChevronDown className="h-4 w-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="max-w-[66ch] whitespace-pre-line px-[18px] pb-4 text-[15px] text-ink-2">{i.a}</p>
              </details>
            ))}
          </div>
        </>
      );
    case "text":
      return (
        <>
          {c.heading && <Heading text={c.heading} />}
          {c.text && (
            <div
              className={cn(
                "prose max-w-[65ch] text-[16px] leading-[1.7] text-ink-2",
                "prose-p:my-2 prose-a:text-brand-ink prose-headings:font-display prose-headings:text-ink prose-strong:text-ink",
                "prose-li:my-0.5 [&_li>p]:my-0 [&_li>p]:inline prose-blockquote:border-brand-line prose-blockquote:text-ink-2"
              )}
              dangerouslySetInnerHTML={{ __html: c.text }}
            />
          )}
        </>
      );
    case "image":
      return (
        <figure className="flex flex-col gap-2">
          {heading && <Heading text={heading} />}
          <img src={c.imageUrl} alt={c.altText || ""} className="w-full rounded-2xl object-cover" loading="lazy" />
          {c.caption && <figcaption className="text-[13.5px] text-ink-3">{c.caption}</figcaption>}
        </figure>
      );
    case "video":
      return (
        <>
          {(block.title || c.title) && <Heading text={block.title || c.title || ""} />}
          <div className="overflow-hidden rounded-2xl bg-black shadow-raised">
            <MuxPlayer playbackId={c.videoId!} metadata={{ video_title: c.title || ctx.communityName }} />
          </div>
          {c.description && <p className="max-w-[65ch] text-[15px] text-ink-2">{c.description}</p>}
        </>
      );
    case "quote":
      return (
        <figure className={cn(CARD, "flex flex-col gap-3 p-5")}>
          <Quote className="h-6 w-6 text-brand-line" aria-hidden="true" />
          <blockquote className="font-display text-[19px] font-medium leading-[1.4] text-ink">{c.text}</blockquote>
          {c.who && <figcaption className="text-[14px] font-semibold text-ink-2">{c.who}</figcaption>}
        </figure>
      );
    case "button":
      return (
        <div className={cn(CARD, "flex flex-wrap items-center justify-between gap-4 p-5")}>
          <div className="min-w-0">
            {block.title && <h2 className="font-display text-[19px] font-semibold text-ink">{block.title}</h2>}
            {c.text && <p className="text-[15px] text-ink-2">{c.text}</p>}
          </div>
          <a href={c.ctaLink} target="_blank" rel="noopener noreferrer" className={BTN_SECONDARY}>
            {c.ctaText}
          </a>
        </div>
      );
    case "teacher":
      return (
        <>
          <Heading text={heading} />
          <div className={cn(CARD, "grid grid-cols-[64px_minmax(0,1fr)] items-start gap-4 p-5 sm:grid-cols-[88px_minmax(0,1fr)] sm:gap-5")}>
            <InitialsAvatar id={ctx.teacher.id} name={ctx.teacher.name} imageUrl={ctx.teacher.avatarUrl} size={88} className="!h-16 !w-16 sm:!h-[88px] sm:!w-[88px]" />
            <div className="min-w-0">
              <h3 className="font-display text-[19px] font-semibold text-ink">{ctx.teacher.name}</h3>
              <p className="mt-0.5 text-[13.5px] text-ink-3">Teacher and host of {ctx.communityName}</p>
              {c.bio && <p className="mt-2.5 max-w-[62ch] whitespace-pre-line text-[15.5px] text-ink-2">{c.bio}</p>}
              <div className="mt-3 flex flex-wrap gap-x-[18px] gap-y-2 text-[13.5px] text-ink-2">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-ink-3" aria-hidden="true" />
                  {ctx.data.memberCount} members
                </span>
                {ctx.data.upcoming.length > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4 text-ink-3" aria-hidden="true" />
                    {ctx.data.upcoming.length} classes coming up
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      );
    default:
      return null;
  }
}

export function blockLabel(b: AboutBlock): string {
  return isAuto(b.type) ? AUTO_INFO[b.type].name : WRITTEN_INFO[b.type].name;
}
