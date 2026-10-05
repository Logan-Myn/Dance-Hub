"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, BookOpen, CalendarDays, CheckCircle2, GraduationCap, Plus, Video, type LucideIcon } from "lucide-react";
import toast from "react-hot-toast";
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY } from "@/components/community-feed/feed-header";
import { Card, Screen, ScreenHead } from "@/components/community-admin/ui";
import { InlineConfirm } from "@/components/ds/inline-confirm";
import { Pill } from "@/components/ds/pill";
import { Switch } from "@/components/ds/switch";
import { useNow } from "@/hooks/use-now";
import { useViewerTimeZone } from "@/hooks/use-viewer-time-zone";
import { clock } from "@/components/community-calendar/format";
import type { OfferingFacts } from "@/lib/admin/offering-facts";
import type { OfferingKey, Offerings } from "@/lib/offerings";
import { communityPath } from "@/lib/safe-redirect";
import { relativeDayWord } from "@/lib/time/format";
import { cn } from "@/lib/utils";

const OFF_TEXT: Record<OfferingKey, string> = {
  liveClasses: "The Calendar tab, the next class card and the live class blocks on your About page disappear for members. Scheduled classes are kept.",
  courses: "The Classroom tab and the course blocks disappear for members. Courses and progress are kept.",
  privateLessons: "The Private lessons tab and the booking blocks disappear. Lessons already booked still happen.",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function OfferingsClient({ slug, initial, facts }: { slug: string; initial: Offerings; facts: OfferingFacts }) {
  const router = useRouter();
  const now = useNow(60_000) ?? new Date();
  const timeZone = useViewerTimeZone(null);
  const [on, setOn] = useState(initial);
  const [confirming, setConfirming] = useState<OfferingKey | null>(null);
  const [busy, setBusy] = useState<OfferingKey | null>(null);

  const save = async (key: OfferingKey, value: boolean) => {
    setBusy(key);
    setConfirming(null);
    const before = on;
    setOn({ ...on, [key]: value });
    try {
      const res = await fetch(`/api/community/${slug}/offerings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setOn(data.offerings);
      toast.success(value ? "Turned on. Members see it now." : "Turned off. Everything you set up is kept.");
      router.refresh();
    } catch {
      setOn(before);
      toast.error("Couldn't change that. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const card = (key: OfferingKey, icon: LucideIcon, title: string, text: string, factPills: React.ReactNode, links: React.ReactNode) => {
    const enabled = on[key];
    return (
      <Card as="section" aria-label={title} className={cn("grid grid-cols-[44px_minmax(0,1fr)] gap-x-4 gap-y-3 px-5 py-[18px] sm:grid-cols-[44px_minmax(0,1fr)_auto]", !enabled && "bg-surface-2")}>
        <span aria-hidden="true" className={cn("grid h-11 w-11 place-items-center rounded-xl", enabled ? "bg-brand-soft text-brand-ink" : "bg-surface-3 text-ink-3")}>
          {(() => {
            const Icon = icon;
            return <Icon className="h-5 w-5" />;
          })()}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-[14px] text-ink-2">{text}</p>
          {enabled ? (
            <>
              <div className="mt-2.5 flex flex-wrap gap-1.5">{factPills}</div>
              <div className="mt-3 flex flex-wrap gap-2">{links}</div>
            </>
          ) : (
            <p className="mt-2 text-[13.5px] text-ink-2">Off. Members don&apos;t see this anywhere. Everything you set up is kept.</p>
          )}
        </div>
        <Switch
          checked={enabled}
          label={enabled ? "On" : "Off"}
          ariaLabel={title}
          disabled={busy === key}
          onChange={(v) => (v ? void save(key, true) : setConfirming(key))}
          className="col-start-2 row-start-2 justify-self-start sm:col-start-3 sm:row-start-1 sm:justify-self-end"
        />
        {confirming === key && (
          <div className="col-span-2 sm:col-span-1 sm:col-start-2">
            <InlineConfirm title={`Turn off ${title.toLowerCase()}?`} confirmLabel="Turn off" cancelLabel="Keep it on" onCancel={() => setConfirming(null)} onConfirm={() => void save(key, false)}>
              {OFF_TEXT[key]}
            </InlineConfirm>
          </div>
        )}
      </Card>
    );
  };

  const { live, courses, lessons } = facts;
  const nextClass = live.nextAt
    ? `Next: ${relativeDayWord(live.nextAt, now, timeZone, "en-GB").replace(/^(Today|Tomorrow)$/, (m) => m.toLowerCase())} at ${clock(live.nextAt, timeZone)}`
    : null;

  return (
    <Screen>
      <ScreenHead title="Offerings" sub="Choose what your community offers. Tabs, cards and About page blocks follow these switches." />
      <div className="grid gap-3">
        {card(
          "liveClasses",
          Video,
          "Live classes",
          "Scheduled classes over video, with reminders and recordings.",
          <>
            <Pill>
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {plural(live.scheduled, "class scheduled", "classes scheduled")}
            </Pill>
            {nextClass && <Pill>{nextClass}</Pill>}
            {live.replays > 0 && <Pill>{plural(live.replays, "replay", "replays")}</Pill>}
          </>,
          <>
            <Link href={communityPath(slug, "/calendar")} className={cn(BTN_SECONDARY, "h-9")}>
              <CalendarDays aria-hidden="true" />
              Open the calendar
            </Link>
          </>
        )}
        {card(
          "courses",
          BookOpen,
          "Courses",
          "Video lessons in chapters. Members track their progress.",
          <>
            <Pill>{plural(courses.published, "course published", "courses published")}</Pill>
            {courses.hidden > 0 && <Pill variant="muted">{plural(courses.hidden, "hidden", "hidden")}</Pill>}
            <Pill>{plural(courses.started, "member started", "members started")}</Pill>
          </>,
          <Link href={communityPath(slug, "/classroom")} className={cn(BTN_SECONDARY, "h-9")}>
            <BookOpen aria-hidden="true" />
            Open the classroom
          </Link>
        )}
        {card(
          "privateLessons",
          GraduationCap,
          "Private lessons",
          "One on one sessions booked into your calendar, with member prices.",
          <>
            <Pill>{plural(lessons.types, "lesson type", "lesson types")}</Pill>
            {lessons.types > 0 && lessons.openTimes === 0 ? (
              <Pill variant="warn">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                No open times
              </Pill>
            ) : (
              <Pill>{plural(lessons.openTimes, "open time", "open times")}</Pill>
            )}
            <Pill>{lessons.bookedThisMonth} booked this month</Pill>
          </>,
          <>
            {lessons.types === 0 ? (
              <Link href={communityPath(slug, "/private-lessons")} className={cn(BTN_PRIMARY, "h-9")}>
                <Plus aria-hidden="true" />
                Add a lesson type
              </Link>
            ) : lessons.openTimes === 0 ? (
              <Link href={communityPath(slug, "/private-lessons")} className={cn(BTN_PRIMARY, "h-9")}>
                <Plus aria-hidden="true" />
                Add open times
              </Link>
            ) : null}
            <Link href={communityPath(slug, "/private-lessons")} className={cn(lessons.types === 0 || lessons.openTimes === 0 ? BTN_GHOST : BTN_SECONDARY, "h-9")}>
              Open private lessons
            </Link>
          </>
        )}
      </div>
      <p className="flex items-center gap-2 text-[13.5px] text-ink-3">
        <CheckCircle2 className="h-4 w-4 text-ok" aria-hidden="true" />
        The community feed is always on. It&apos;s where members talk, share clips and ask questions.
      </p>
    </Screen>
  );
}
