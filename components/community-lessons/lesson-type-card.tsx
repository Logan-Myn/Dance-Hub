"use client";

import { useState } from "react";
import { CalendarClock, Clock, Eye, EyeOff, Info, MapPin, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { InlineConfirm } from "@/components/ds/inline-confirm";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/community-feed/feed-header";
import { Pill } from "@/components/ds/pill";
import type { OpenSlot } from "@/lib/private-lessons/data";
import { describeCancellationPolicy, euro } from "@/lib/private-lessons/policy";
import { cn } from "@/lib/utils";
import { clock } from "@/components/community-calendar/format";
import type { LessonType } from "./types";

const WHERE = { online: "Online, over video", in_person: "In person", both: "Online or in person" } as const;

export function LessonTypeCard({
  lesson,
  isMember,
  slots,
  timeZone,
  now,
  isOwner,
  stats,
  onBook,
  onEdit,
  onToggleVisible,
  onDelete,
}: {
  lesson: LessonType;
  isMember: boolean;
  /** Open times for this lesson's teacher. */
  slots: OpenSlot[];
  timeZone: string;
  now: Date;
  isOwner: boolean;
  stats?: { thisMonth: number; paidThisMonth: number; upcoming: number };
  onBook: () => void;
  onEdit?: () => void;
  onToggleVisible?: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const discounted = lesson.memberPrice != null && lesson.memberPrice > 0 && lesson.memberPrice < lesson.regularPrice;
  const price = isMember && discounted ? lesson.memberPrice! : lesson.regularPrice;
  const next = slots[0];
  const inTwoWeeks = slots.filter((s) => new Date(s.startsAt).getTime() - now.getTime() < 14 * 86_400_000).length;

  return (
    <article
      className={cn(
        "flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-5 transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-raised",
        isOwner && !lesson.isActive && "opacity-75"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-balance font-display text-[20px] font-semibold leading-[1.2] text-ink">{lesson.title}</h3>
        {isOwner ? (
          <Pill variant={lesson.isActive ? "ok" : "muted"}>{lesson.isActive ? "Visible" : "Hidden"}</Pill>
        ) : (
          discounted && isMember && <Pill variant="brand">Member price</Pill>
        )}
      </div>
      {lesson.description && <p className="whitespace-pre-line text-[14.5px] text-ink-2">{lesson.description}</p>}
      <ul className="flex flex-col gap-2 text-[14px] text-ink-2">
        <li className="flex items-start gap-2.5">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
          {lesson.durationMinutes} min
        </li>
        <li className="flex items-start gap-2.5">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
          {WHERE[lesson.locationType]}
        </li>
        <li className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
          {describeCancellationPolicy(lesson.cutoffHours, lesson.latePolicy)}
        </li>
        {lesson.requirements && (
          <li className="flex items-start gap-2.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
            {lesson.requirements}
          </li>
        )}
        {lesson.maxPerMonth != null && lesson.maxPerMonth > 0 && (
          <li className="flex items-start gap-2.5">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
            Up to {lesson.maxPerMonth} a month
          </li>
        )}
      </ul>

      {isOwner && stats ? (
        <div className="grid grid-cols-3 gap-2">
          {[
            [stats.upcoming, "Upcoming"],
            [stats.thisMonth, "This month"],
            [euro(stats.paidThisMonth), "Paid this month"],
          ].map(([v, label]) => (
            <div key={String(label)} className="rounded-[10px] bg-surface-2 px-3 py-2.5">
              <b className="block font-display text-[20px] font-semibold leading-tight tabular-nums text-ink">{v}</b>
              <span className="text-[12.5px] text-ink-2">{label}</span>
            </div>
          ))}
        </div>
      ) : next ? (
        <p className="flex items-center gap-2 rounded-[10px] bg-surface-2 px-3 py-2.5 text-[13.5px] text-ink-2">
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Next free:{" "}
            <strong className="text-ink">
              {new Date(next.startsAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone })}, {clock(next.startsAt, timeZone)}
            </strong>
            {inTwoWeeks > 1 && `. ${inTwoWeeks} open in the next two weeks.`}
          </span>
        </p>
      ) : (
        <p className="flex items-center gap-2 rounded-[10px] bg-warn-soft px-3 py-2.5 text-[13.5px] text-warn">
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
          No open times right now
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-line pt-3.5">
        <div>
          <p className="flex items-baseline gap-2 tabular-nums">
            <b className="font-display text-[28px] font-semibold leading-none text-ink">{euro(price)}</b>
            {isMember && discounted && <s className="text-[15px] text-ink-3">{euro(lesson.regularPrice)}</s>}
          </p>
          <p className="mt-1 text-[13px] text-ink-2">
            {isOwner
              ? discounted
                ? `Members pay ${euro(lesson.memberPrice!)}`
                : "Same price for everyone"
              : isMember && discounted
                ? (
                  <>
                    You save <strong className="text-brand-ink">{euro(lesson.regularPrice - lesson.memberPrice!)}</strong> as a member
                  </>
                )
                : discounted
                  ? `Members pay ${euro(lesson.memberPrice!)}`
                  : "Per lesson"}
          </p>
        </div>
        {isOwner ? (
          <div className="flex gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={onToggleVisible}>
              {lesson.isActive ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              {lesson.isActive ? "Hide" : "Show"}
            </button>
            <button type="button" className={BTN_SECONDARY} onClick={onEdit}>
              <Pencil aria-hidden="true" />
              Edit
            </button>
            <button type="button" aria-label={`Remove ${lesson.title}`} className={cn(BTN_SECONDARY, "w-[38px] px-0 text-live")} onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button type="button" className={BTN_PRIMARY} onClick={onBook} disabled={!next}>
            Book a time
          </button>
        )}
      </div>
      {isOwner && confirmDelete && (
        <InlineConfirm
          title="Remove this lesson type?"
          confirmLabel={deleting ? "Removing…" : "Remove"}
          cancelLabel="Keep it"
          busy={deleting}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setDeleting(true);
            try {
              await onDelete?.();
            } finally {
              setDeleting(false);
              setConfirmDelete(false);
            }
          }}
        >
          Members can&apos;t book it any more. Bookings already made stay as they are.
        </InlineConfirm>
      )}
    </article>
  );
}
