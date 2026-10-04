"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarPlus, ChevronDown, Clock, MessageSquareText, Video, X } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY } from "@/components/community-feed/feed-header";
import { InlineConfirm } from "@/components/ds/inline-confirm";
import { Pill } from "@/components/ds/pill";
import { clock, city } from "@/components/community-calendar/format";
import { lessonJoinable } from "@/lib/calendar/status";
import type { ViewerBooking } from "@/lib/private-lessons/data";
import { canCancel, euro, freeCancelUntil, refundOnCancel } from "@/lib/private-lessons/policy";
import { startsIn } from "@/lib/time/format";
import { cn } from "@/lib/utils";

const GRACE = 15 * 60_000;
const endMs = (b: ViewerBooking) => new Date(b.startsAt).getTime() + b.durationMinutes * 60_000;
export const isPastBooking = (b: ViewerBooking, now: Date) => b.status === "completed" || now.getTime() > endMs(b) + GRACE;

function DateTileLarge({ iso, timeZone }: { iso: string; timeZone: string }) {
  const f = (o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleDateString("en-GB", { ...o, timeZone });
  return (
    <div aria-hidden="true" className="w-14 overflow-hidden rounded-[14px] border border-line bg-surface text-center sm:w-16">
      <span className="block bg-brand py-1.5 text-[11.5px] font-semibold leading-none text-white">{f({ month: "short" })}</span>
      <span className="block pb-[3px] pt-[7px] font-display text-[26px] font-semibold leading-none tabular-nums text-ink">{f({ day: "numeric" })}</span>
      <span className="block pb-1.5 text-[11.5px] font-semibold text-ink-3">{f({ weekday: "short" })}</span>
    </div>
  );
}

/** The viewer's upcoming lesson (and the rest), then past lessons with the teacher's notes. */
export function YourLessons({
  bookings,
  teacherName,
  teacherZone,
  timeZone,
  now,
}: {
  bookings: ViewerBooking[];
  teacherName: string;
  teacherZone: string | null;
  timeZone: string;
  now: Date;
}) {
  const router = useRouter();
  const upcoming = bookings.filter((b) => !isPastBooking(b, now)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = bookings.filter((b) => isPastBooking(b, now));
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openNotes, setOpenNotes] = useState<string | null>(null);
  if (!upcoming.length && !past.length) return null;

  const cancel = async (b: ViewerBooking) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/${b.id}/cancel`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.message || data?.error || "Couldn't cancel the lesson. Try again.");
        return;
      }
      const refunded = (data?.refunded_amount_cents ?? 0) / 100;
      toast.success(refunded > 0 ? `Lesson canceled. ${euro(refunded)} is on its way back to you.` : "Lesson canceled.");
      router.refresh();
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  const showOther = (iso: string) => teacherZone && clock(iso, teacherZone) !== clock(iso, timeZone);

  return (
    <section aria-labelledby="your-lessons" className="mt-7 flex flex-col gap-3.5">
      <h2 id="your-lessons" className="font-display text-[19px] font-semibold text-ink">
        Your lessons
      </h2>

      {upcoming.map((b, i) => {
        const joinable = lessonJoinable(b.startsAt, b.durationMinutes, now);
        const end = new Date(endMs(b)).toISOString();
        const refund = refundOnCancel({ pricePaid: b.pricePaid, scheduledAt: b.startsAt, cutoffHours: b.cutoffHours, latePolicy: b.latePolicy, role: "student", now });
        const until = freeCancelUntil(b.startsAt, b.cutoffHours, b.latePolicy);
        const soon = new Date(b.startsAt).getTime() - now.getTime() < 60 * 60_000;
        return (
          <article
            key={b.id}
            className={cn(
              "grid grid-cols-[56px_minmax(0,1fr)] items-start gap-x-4 gap-y-3.5 rounded-[20px] border bg-surface p-4 sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:items-center sm:gap-5 sm:py-5 sm:pl-5 sm:pr-6",
              i === 0 ? "shadow-raised" : "",
              joinable || soon ? "border-brand/55" : "border-line"
            )}
          >
            <DateTileLarge iso={b.startsAt} timeZone={timeZone} />
            <div className="flex min-w-0 flex-col gap-1.5">
              <h3 className="font-display text-[19px] font-semibold leading-tight text-ink">
                {b.lessonTitle} with {teacherName}
              </h3>
              <p className="text-[15px] tabular-nums text-ink">
                {new Date(b.startsAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone })}, {clock(b.startsAt, timeZone)} to{" "}
                {clock(end, timeZone)}
                {showOther(b.startsAt) && (
                  <small className="text-[13px] text-ink-3">
                    {" "}
                    ({clock(b.startsAt, teacherZone!)} for {teacherName} in {city(teacherZone!)})
                  </small>
                )}
              </p>
              <div className="mt-0.5 flex flex-wrap gap-1.5">
                <Pill variant={joinable ? "brand" : "neutral"}>
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {joinable ? "Room open" : `Starts ${startsIn(b.startsAt, now)}`}
                </Pill>
                <Pill variant="ok">Paid {euro(b.pricePaid)}</Pill>
              </div>
            </div>
            <div className="col-span-2 flex min-w-0 flex-col gap-2 sm:col-span-1 sm:min-w-[200px]">
              {joinable ? (
                <Link href={`/video-session/${b.id}`} className={cn(BTN_PRIMARY, "h-11 text-[15px]")}>
                  <Video aria-hidden="true" />
                  Join lesson
                </Link>
              ) : (
                <p className="text-center text-[12.5px] text-ink-3">The room opens 15 minutes before.</p>
              )}
              <div className="flex gap-1.5">
                <a href={`/api/bookings/${b.id}/ics`} download className={cn(BTN_SECONDARY, "h-8 flex-1 px-2.5 text-[13px]")}>
                  <CalendarPlus aria-hidden="true" />
                  Add to calendar
                </a>
                {canCancel(b.startsAt, now) && (
                  <button type="button" className={cn(BTN_GHOST, "h-8 flex-1 px-2.5 text-[13px]")} onClick={() => setConfirming(b.id)}>
                    <X aria-hidden="true" />
                    Cancel
                  </button>
                )}
              </div>
            </div>
            {confirming === b.id && (
              <div className="col-span-2 sm:col-span-3">
                <InlineConfirm
                  title="Cancel this lesson?"
                  confirmLabel={busy ? "Canceling…" : "Cancel lesson"}
                  cancelLabel="Keep it"
                  busy={busy}
                  onCancel={() => setConfirming(null)}
                  onConfirm={() => cancel(b)}
                >
                  {refund > 0
                    ? `You get ${euro(refund)} back. To change the time, cancel and book again.`
                    : `It's too late for a refund${until ? ` (the free cancellation ended ${until.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone })}, ${clock(until.toISOString(), timeZone)})` : ""}.`}
                </InlineConfirm>
              </div>
            )}
          </article>
        );
      })}

      {past.length > 0 && (
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {past.map((b) => (
            <div key={b.id}>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <strong className="block truncate text-[15px] text-ink">{b.lessonTitle}</strong>
                  <span className="text-[13px] text-ink-3">
                    {new Date(b.startsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone })}, {b.durationMinutes} min
                  </span>
                </div>
                {b.teacherNotes ? (
                  <button
                    type="button"
                    aria-expanded={openNotes === b.id}
                    onClick={() => setOpenNotes((o) => (o === b.id ? null : b.id))}
                    className={cn(BTN_SECONDARY, "h-8 px-2.5 text-[13px]")}
                  >
                    <MessageSquareText aria-hidden="true" />
                    {teacherName}&apos;s notes
                    <ChevronDown className={cn("!h-4 !w-4 transition-transform", openNotes === b.id && "rotate-180")} aria-hidden="true" />
                  </button>
                ) : (
                  <span className="text-[13px] text-ink-3">No notes yet</span>
                )}
              </div>
              {openNotes === b.id && b.teacherNotes && (
                <div className="px-4 pb-4 motion-safe:animate-pop-in">
                  <div className="flex max-w-[68ch] flex-col gap-2 rounded-xl bg-surface-2 px-4 py-3.5 text-[14.5px]">
                    <span className="text-[13px] font-semibold text-ink-2">Notes from {teacherName}</span>
                    <p className="whitespace-pre-line text-ink">{b.teacherNotes}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
