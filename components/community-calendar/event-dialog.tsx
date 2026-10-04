"use client";

import { useState } from "react";
import { Copy, GraduationCap, Pencil, Repeat, RotateCcw, User, Video, X } from "lucide-react";
import { AppDialog } from "@/components/ds/app-dialog";
import { InlineConfirm } from "@/components/ds/inline-confirm";
import { Pill } from "@/components/ds/pill";
import { BTN_GHOST, BTN_SECONDARY } from "@/components/community-feed/feed-header";
import { startsIn } from "@/lib/time/format";
import { cn } from "@/lib/utils";
import { clock, city, dateLong, dayWord, endOf } from "./format";
import { AddToCalendar, PrimaryAction } from "./item-actions";
import { itemState, itemTitle } from "./item-state";
import type { CalendarCtx, CalendarItem } from "./types";

export function EventDialog({
  item,
  ctx,
  onClose,
  onEdit,
  onRepeat,
  onCancelClass,
  onRestore,
}: {
  item: CalendarItem | null;
  ctx: CalendarCtx;
  onClose: () => void;
  onEdit: (item: CalendarItem) => void;
  onRepeat: (item: CalendarItem) => Promise<void>;
  onCancelClass: (item: CalendarItem) => Promise<void>;
  onRestore: (item: CalendarItem) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!item) return null;
  const st = itemState(item, ctx.now);
  const end = endOf(item.startsAt, item.durationMinutes);
  const ownerTools = ctx.isOwner && item.kind === "class";
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <AppDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          setConfirming(false);
          onClose();
        }
      }}
      title={itemTitle(item)}
    >
      <div className="flex flex-wrap gap-1.5">
        {item.kind === "lesson" ? (
          <Pill variant="brand">
            <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
            Private lesson
          </Pill>
        ) : (
          <Pill>
            <Video className="h-3.5 w-3.5" aria-hidden="true" />
            Live class
          </Pill>
        )}
        {st === "live" ? (
          <Pill variant="live">Live now</Pill>
        ) : st === "canceled" ? (
          <Pill variant="muted">Canceled</Pill>
        ) : st === "past" ? (
          <Pill>Ended</Pill>
        ) : (
          <Pill variant="brand">Starts {startsIn(item.startsAt, ctx.now)}</Pill>
        )}
        {item.kind === "class" && item.seriesId && (
          <Pill>
            <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
            Weekly series
          </Pill>
        )}
      </div>

      <p className="text-[15px] tabular-nums text-ink">
        <strong className="font-semibold">
          {dayWord(item.startsAt, ctx.now, ctx.timeZone)}, {dateLong(item.startsAt, ctx.timeZone)}
        </strong>
        <br />
        {clock(item.startsAt, ctx.timeZone)} to {clock(end, ctx.timeZone)}, {item.durationMinutes} min
        {ctx.otherZone && (
          <small className="block text-[13px] text-ink-3">
            {clock(item.startsAt, ctx.otherZone)} to {clock(end, ctx.otherZone)} in {city(ctx.otherZone)}
          </small>
        )}
      </p>

      {st === "canceled" && (
        <p className="text-[15px] text-ink-2">
          <strong className="text-ink">Canceled by {ctx.teacherName}.</strong> It stays here so nobody waits in an empty room.
        </p>
      )}
      {item.kind === "class" && item.description && <p className="max-w-[60ch] whitespace-pre-line text-[15px] text-ink-2">{item.description}</p>}

      <div className="flex flex-col gap-2 text-[14px] text-ink-2">
        <div className="flex items-start gap-2.5">
          <User className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
          <span>
            {item.kind === "class"
              ? `With ${item.teacherName}, online. Join from this page or the Community page.`
              : `With ${item.withName}, one on one over video.`}
          </span>
        </div>
        {item.kind === "class" && (
          <div className="flex items-start gap-2.5">
            <Video className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
            <span>{item.enableRecording ? "Recorded. The replay lands in Classroom when it's ready." : "Not recorded."}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-1.5">
        <PrimaryAction item={item} ctx={ctx} />
        <AddToCalendar item={item} ctx={ctx} />
        {ownerTools && st === "canceled" && (
          <button type="button" disabled={busy} className={BTN_SECONDARY} onClick={() => run(() => onRestore(item))}>
            <RotateCcw aria-hidden="true" />
            Restore class
          </button>
        )}
      </div>

      {ownerTools && st !== "past" && st !== "canceled" && (
        confirming ? (
          <InlineConfirm
            title="Cancel this class?"
            confirmLabel={busy ? "Canceling…" : "Cancel class"}
            cancelLabel="Keep class"
            busy={busy}
            onCancel={() => setConfirming(false)}
            onConfirm={() => run(() => onCancelClass(item))}
          >
            It stays on the calendar marked as canceled, so nobody shows up to an empty room.
          </InlineConfirm>
        ) : (
          <div className="flex flex-wrap gap-2 border-t border-line pt-3.5">
            <button type="button" className={cn(BTN_SECONDARY, "h-8 px-2.5 text-[13px]")} onClick={() => onEdit(item)}>
              <Pencil aria-hidden="true" />
              Edit
            </button>
            <button type="button" disabled={busy} className={cn(BTN_SECONDARY, "h-8 px-2.5 text-[13px]")} onClick={() => run(() => onRepeat(item))}>
              <Copy aria-hidden="true" />
              Repeat next week
            </button>
            <button type="button" className={cn(BTN_GHOST, "h-8 px-2.5 text-[13px]")} onClick={() => setConfirming(true)}>
              <X aria-hidden="true" />
              Cancel class
            </button>
          </div>
        )
      )}
    </AppDialog>
  );
}
