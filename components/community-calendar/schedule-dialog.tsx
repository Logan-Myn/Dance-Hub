"use client";

import { useId, useMemo, useState } from "react";
import { Globe } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { AppDialog, FIELD_ERROR, FIELD_INPUT, FIELD_LABEL } from "@/components/ds/app-dialog";
import { BTN_GHOST, BTN_PRIMARY } from "@/components/community-feed/feed-header";
import { zonedTimeToUtc } from "@/lib/calendar-week";
import { cn } from "@/lib/utils";
import { city } from "./format";
import type { CalendarClass } from "./types";

const LENGTHS = [15, 30, 45, 60, 75, 90, 120, 150, 180, 240];

export interface ScheduleInput {
  title: string;
  description: string;
  startsAt: string;
  durationMinutes: number;
  repeatWeeks: number;
  enableRecording: boolean;
}

function Switch({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn("inline-flex items-center gap-2.5 text-left text-[14px] font-medium", checked ? "text-ink" : "text-ink-2")}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative h-[21px] w-9 shrink-0 rounded-full transition-colors after:absolute after:left-[3px] after:top-[3px] after:h-[15px] after:w-[15px] after:rounded-full after:bg-surface after:shadow-card after:transition-transform",
          checked ? "bg-brand after:translate-x-[15px]" : "bg-line-strong"
        )}
      />
      {children}
    </button>
  );
}

/** Schedule a class (with weekly repeat) or edit one. Times are in `timeZone`. */
export function ScheduleDialog({
  open,
  onOpenChange,
  timeZone,
  editing,
  prefill,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timeZone: string;
  editing: CalendarClass | null;
  /** Start for a new class (a clicked slot), as an ISO instant. */
  prefill: string;
  onSubmit: (input: ScheduleInput) => Promise<string | null>;
}) {
  const start = editing?.startsAt ?? prefill;
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [date, setDate] = useState(() => formatInTimeZone(new Date(start), timeZone, "yyyy-MM-dd"));
  const [time, setTime] = useState(() => formatInTimeZone(new Date(start), timeZone, "HH:mm"));
  const [length, setLength] = useState(editing?.durationMinutes ?? 60);
  // One class unless the owner asks for more (undoing six is six cancels).
  const [repeat, setRepeat] = useState(1);
  const [record, setRecord] = useState(editing ? editing.enableRecording : true);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = { title: useId(), desc: useId(), date: useId(), time: useId(), len: useId(), rep: useId(), err: useId() };

  const weekday = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    if (!y || !m || !d) return "week";
    return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  }, [date]);
  const lengths = LENGTHS.includes(length) ? LENGTHS : [...LENGTHS, length].sort((a, b) => a - b);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!title.trim()) {
      setTitleError("Give the class a name members will recognize.");
      return;
    }
    const [h, m] = time.split(":").map(Number);
    if (!date || Number.isNaN(h) || Number.isNaN(m)) {
      setFormError("Pick a date and a start time.");
      return;
    }
    const startsAt = zonedTimeToUtc(date, h, m, timeZone);
    if (startsAt.getTime() < Date.now() - 60_000 && !(editing && editing.startsAt === startsAt.toISOString())) {
      setFormError("That time has passed. Pick a time in the future.");
      return;
    }
    setBusy(true);
    try {
      const error = await onSubmit({
        title: title.trim(),
        description: description.trim(),
        startsAt: startsAt.toISOString(),
        durationMinutes: length,
        repeatWeeks: editing ? 1 : repeat,
        enableRecording: record,
      });
      if (error) setFormError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title={editing ? "Edit class" : "Schedule a class"}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <div>
          <label htmlFor={ids.title} className={FIELD_LABEL}>Class name</label>
          <input
            id={ids.title}
            autoFocus
            value={title}
            maxLength={80}
            autoComplete="off"
            placeholder="For example, Floorwork, week 7"
            aria-invalid={!!titleError}
            aria-describedby={titleError ? ids.err : undefined}
            onChange={(e) => {
              setTitle(e.target.value);
              if (titleError) setTitleError(null);
            }}
            className={cn(FIELD_INPUT, "font-display text-[16px] font-semibold")}
          />
          {titleError && <p id={ids.err} className={FIELD_ERROR}>{titleError}</p>}
        </div>
        <div>
          <label htmlFor={ids.desc} className={FIELD_LABEL}>What you&apos;ll cover</label>
          <textarea
            id={ids.desc}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Shown in the class details."
            className={cn(FIELD_INPUT, "min-h-[84px] resize-y leading-[1.55]")}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={ids.date} className={FIELD_LABEL}>Date</label>
            <input id={ids.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(FIELD_INPUT, "h-[42px] py-0 tabular-nums")} />
          </div>
          <div>
            <label htmlFor={ids.time} className={FIELD_LABEL}>Start time</label>
            <input id={ids.time} type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} className={cn(FIELD_INPUT, "h-[42px] py-0 tabular-nums")} />
          </div>
          <div>
            <label htmlFor={ids.len} className={FIELD_LABEL}>Length</label>
            <select id={ids.len} value={length} onChange={(e) => setLength(Number(e.target.value))} className={cn(FIELD_INPUT, "h-[42px] py-0")}>
              {lengths.map((l) => (
                <option key={l} value={l}>
                  {l} min
                </option>
              ))}
            </select>
          </div>
          {!editing && (
            <div>
              <label htmlFor={ids.rep} className={FIELD_LABEL}>Repeat</label>
              <select id={ids.rep} value={repeat} onChange={(e) => setRepeat(Number(e.target.value))} className={cn(FIELD_INPUT, "h-[42px] py-0")}>
                <option value={1}>Does not repeat</option>
                <option value={4}>Every {weekday}, 4 weeks</option>
                <option value={6}>Every {weekday}, 6 weeks</option>
                <option value={12}>Every {weekday}, 12 weeks</option>
              </select>
            </div>
          )}
          <p className="flex items-center gap-1.5 text-[13px] text-ink-3 sm:col-span-2">
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            Times are in {city(timeZone)} time. Members see them in their own time zone.
          </p>
        </div>
        <Switch checked={record} onChange={setRecord}>
          Record it. The replay goes to Classroom automatically.
        </Switch>
        {formError && (
          <p role="alert" className="rounded-xl border border-live/30 bg-live-soft px-3.5 py-2.5 text-[14px] text-ink">
            {formError}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={BTN_GHOST} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" className={BTN_PRIMARY} disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Schedule"}
          </button>
        </div>
      </form>
    </AppDialog>
  );
}
