"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, MessageSquareText, Phone, Video, X } from "lucide-react";
import toast from "react-hot-toast";
import { AppDialog, FIELD_INPUT, FIELD_LABEL } from "@/components/ds/app-dialog";
import { InitialsAvatar } from "@/components/ds/initials-avatar";
import { InlineConfirm } from "@/components/ds/inline-confirm";
import { Pill } from "@/components/ds/pill";
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY } from "@/components/community-feed/feed-header";
import { clock } from "@/components/community-calendar/format";
import { lessonJoinable } from "@/lib/calendar/status";
import type { OwnerBooking } from "@/lib/private-lessons/data";
import { canCancel, euro } from "@/lib/private-lessons/policy";
import { cn } from "@/lib/utils";

type Tab = "upcoming" | "past" | "canceled";

const ended = (b: OwnerBooking, now: Date) =>
  b.status === "completed" || (!!b.startsAt && now.getTime() > new Date(b.startsAt).getTime() + (b.durationMinutes + 15) * 60_000);

function whenText(b: OwnerBooking, timeZone: string) {
  if (!b.startsAt) return "No time set";
  return `${new Date(b.startsAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone })}, ${clock(b.startsAt, timeZone)}`;
}

/** Bookings for the owner: upcoming, past (where notes get written) and canceled. */
export function OwnerBookings({ bookings, timeZone, now }: { bookings: OwnerBooking[]; timeZone: string; now: Date }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [open, setOpen] = useState<OwnerBooking | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const groups: Record<Tab, OwnerBooking[]> = {
    upcoming: bookings
      .filter((b) => b.status !== "canceled" && b.paymentStatus === "succeeded" && !ended(b, now))
      .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? "")),
    past: bookings.filter((b) => b.status !== "canceled" && b.paymentStatus === "succeeded" && ended(b, now)),
    canceled: bookings.filter((b) => b.status === "canceled"),
  };
  const list = groups[tab];

  const openBooking = (b: OwnerBooking) => {
    setOpen(b);
    setNotes(b.teacherNotes ?? "");
    setConfirming(false);
  };

  const saveNotes = async () => {
    if (!open) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/bookings/${open.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacher_notes: notes }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Notes saved. ${open.studentName.split(" ")[0]} sees them on the private lessons page.`);
      router.refresh();
    } catch {
      toast.error("Couldn't save the notes. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const cancelBooking = async () => {
    if (!open) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/bookings/${open.id}/cancel`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.message || data?.error || "Couldn't cancel the booking. Try again.");
        return;
      }
      toast.success(`Booking canceled. ${euro((data?.refunded_amount_cents ?? 0) / 100)} refunded to ${open.studentName}.`);
      setOpen(null);
      router.refresh();
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  };

  return (
    <section aria-labelledby="owner-bookings" className="mt-7 flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="owner-bookings" className="font-display text-[19px] font-semibold text-ink">
          Bookings
        </h2>
        <div role="group" aria-label="Show" className="inline-flex rounded-[10px] bg-surface-2 p-[3px]">
          {(
            [
              ["upcoming", "Upcoming"],
              ["past", "Past"],
              ["canceled", "Canceled"],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "h-7 rounded-[7px] px-2.5 text-[13.5px] transition-colors",
                tab === t ? "bg-surface font-semibold text-ink shadow-card" : "font-medium text-ink-2 hover:text-ink"
              )}
            >
              {label} <span className="tabular-nums text-ink-3">{groups[t].length}</span>
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong bg-surface px-5 py-6 text-center text-[14.5px] text-ink-2">
          {tab === "upcoming" ? "No upcoming bookings yet. When a member books a time, it shows up here." : tab === "past" ? "No past lessons yet." : "No canceled bookings."}
        </p>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {list.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => openBooking(b)}
              className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-surface-2 sm:grid-cols-[minmax(160px,1.2fr)_minmax(140px,1fr)_minmax(150px,1fr)_auto]"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <InitialsAvatar id={b.studentEmail} name={b.studentName} size={32} />
                <span className="min-w-0">
                  <strong className="block truncate text-[14.5px] text-ink">{b.studentName}</strong>
                  <span className="text-[13px] text-ink-3">{b.isMember ? "Member" : "Not a member"}</span>
                </span>
              </span>
              <span className="hidden min-w-0 sm:block">
                <strong className="block truncate text-[14px] font-semibold text-ink">{b.lessonTitle}</strong>
                <span className="text-[13px] tabular-nums text-ink-3">{whenText(b, timeZone)}</span>
              </span>
              <span className="hidden min-w-0 truncate text-[13px] text-ink-2 sm:block">
                {tab === "past" ? (b.teacherNotes ? "Notes written" : "Add notes") : b.studentMessage || "No message"}
              </span>
              <span className="text-right">
                <span className="block text-[14px] font-semibold tabular-nums text-ink">{euro(b.pricePaid)}</span>
                <span className="text-[12.5px] text-ink-3 sm:hidden">{whenText(b, timeZone)}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <AppDialog open onOpenChange={(o) => !o && setOpen(null)} title={`${open.lessonTitle} with ${open.studentName}`}>
          <div className="flex flex-wrap gap-1.5">
            <Pill variant={open.status === "canceled" ? "muted" : ended(open, now) ? "neutral" : "brand"}>
              {open.status === "canceled" ? "Canceled" : ended(open, now) ? "Done" : "Upcoming"}
            </Pill>
            <Pill variant={open.paymentStatus === "refunded" ? "warn" : "ok"}>
              {open.paymentStatus === "refunded" ? "Refunded" : `Paid ${euro(open.pricePaid)}`}
            </Pill>
            <Pill>{open.isMember ? "Member" : "Not a member"}</Pill>
          </div>
          <p className="text-[15px] tabular-nums text-ink">
            <strong>{whenText(open, timeZone)}</strong>, {open.durationMinutes} min
          </p>
          <div className="flex flex-col gap-2 text-[14px] text-ink-2">
            <a href={`mailto:${open.studentEmail}`} className="flex items-center gap-2.5 hover:text-brand-ink">
              <Mail className="h-4 w-4 text-ink-3" aria-hidden="true" />
              {open.studentEmail}
            </a>
            {open.phone && (
              <a href={`tel:${open.phone}`} className="flex items-center gap-2.5 hover:text-brand-ink">
                <Phone className="h-4 w-4 text-ink-3" aria-hidden="true" />
                {open.phone}
              </a>
            )}
          </div>
          {open.studentMessage && (
            <div className="rounded-xl bg-surface-2 px-4 py-3 text-[14.5px]">
              <span className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
                <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                Their message
              </span>
              <p className="whitespace-pre-line text-ink">{open.studentMessage}</p>
            </div>
          )}
          {open.status !== "canceled" && (
            <div>
              <label htmlFor="teacher-notes" className={FIELD_LABEL}>
                Notes for {open.studentName.split(" ")[0]} (they see these after the lesson)
              </label>
              <textarea
                id="teacher-notes"
                value={notes}
                maxLength={5000}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What you worked on, and what to practice before the next lesson."
                className={cn(FIELD_INPUT, "min-h-[110px] resize-y leading-[1.55]")}
              />
              <div className="mt-2 flex justify-end">
                <button type="button" className={BTN_SECONDARY} disabled={saving || notes === (open.teacherNotes ?? "")} onClick={saveNotes}>
                  Save notes
                </button>
              </div>
            </div>
          )}
          {open.status !== "canceled" && open.paymentStatus === "succeeded" && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-3.5">
              {open.startsAt && lessonJoinable(open.startsAt, open.durationMinutes, now) && (
                <Link href={`/video-session/${open.id}`} className={BTN_PRIMARY}>
                  <Video aria-hidden="true" />
                  Join lesson
                </Link>
              )}
              {canCancel(open.startsAt, now) &&
                (confirming ? (
                  <InlineConfirm
                    title="Cancel this booking?"
                    confirmLabel={saving ? "Canceling…" : "Cancel and refund"}
                    cancelLabel="Keep it"
                    busy={saving}
                    onCancel={() => setConfirming(false)}
                    onConfirm={cancelBooking}
                  >
                    {open.studentName} gets the full {euro(open.pricePaid)} back and an email.
                  </InlineConfirm>
                ) : (
                  <button type="button" className={BTN_GHOST} onClick={() => setConfirming(true)}>
                    <X aria-hidden="true" />
                    Cancel booking
                  </button>
                ))}
            </div>
          )}
        </AppDialog>
      )}
    </section>
  );
}
