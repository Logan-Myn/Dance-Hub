"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, ShieldCheck } from "lucide-react";
import { AppDialog, FIELD_INPUT, FIELD_LABEL } from "@/components/ds/app-dialog";
import { BTN_GHOST, BTN_PRIMARY } from "@/components/community-feed/feed-header";
import { LessonPaymentInline, type LessonPaymentOutcome } from "@/components/PrivateLessonPaymentModal";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { dateKeyInTz, formatDayKey, addDaysToKey } from "@/lib/calendar-week";
import type { OpenSlot } from "@/lib/private-lessons/data";
import { describeCancellationPolicy, euro } from "@/lib/private-lessons/policy";
import { cn } from "@/lib/utils";
import { clock } from "@/components/community-calendar/format";
import type { LessonType } from "./types";

type Step = "time" | "details" | "pay" | "done";

const SUGGESTIONS = ["I'm new to this", "I want to work on turns", "Getting ready for a social", "Feedback on a video I'll send"];

function partOfDay(iso: string, tz: string) {
  const h = Number(new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: tz }));
  return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
}

export function BookingDialog({
  open,
  onOpenChange,
  slug,
  lesson,
  isMember,
  slots,
  viewer,
  timeZone,
  todayKey,
  onBooked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  lesson: LessonType;
  isMember: boolean;
  slots: OpenSlot[];
  viewer: { name: string; email: string } | null;
  timeZone: string;
  todayKey: string;
  /** Paid: hide this time on the page until the booking shows up. */
  onBooked: (slotId: string) => void;
}) {
  const router = useRouter();
  const { showAuthModal } = useAuthModal();
  const [step, setStep] = useState<Step>("time");
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const open_ = slots.filter((s) => !taken.has(s.id));
  const days = useMemo(() => Array.from({ length: 31 }, (_, i) => addDaysToKey(todayKey, i)), [todayKey]);
  const byDay = useMemo(() => {
    const m = new Map<string, OpenSlot[]>();
    for (const s of open_) {
      const k = dateKeyInTz(s.startsAt, timeZone);
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return m;
  }, [open_, timeZone]);
  const firstDay = days.find((d) => byDay.has(d)) ?? days[0];
  const [day, setDay] = useState<string | null>(null);
  const shownDay = day && byDay.has(day) ? day : firstDay;
  const [slotId, setSlotId] = useState<string | null>(null);
  const slot = open_.find((s) => s.id === slotId) ?? null;

  const [name, setName] = useState(viewer?.name ?? "");
  const [email, setEmail] = useState(viewer?.email ?? "");
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<{ clientSecret: string; stripeAccountId: string; price: number } | null>(null);
  const [outcome, setOutcome] = useState<LessonPaymentOutcome | null>(null);

  // A member price of 0 means "no member price" (the book route agrees).
  const price =
    isMember && lesson.memberPrice != null && lesson.memberPrice > 0 && lesson.memberPrice < lesson.regularPrice
      ? lesson.memberPrice
      : lesson.regularPrice;
  const when = slot
    ? `${new Date(slot.startsAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone })}, ${clock(slot.startsAt, timeZone)}`
    : null;

  const reset = () => {
    setStep("time");
    setSlotId(null);
    setError(null);
    setPayment(null);
    setOutcome(null);
  };

  const continueFromTime = () => {
    if (!slot) return;
    if (!viewer) {
      showAuthModal("signin", window.location.pathname);
      return;
    }
    setError(null);
    setStep("details");
  };

  const book = async () => {
    if (!slot) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Check the email address. The confirmation goes there.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/community/${encodeURIComponent(slug)}/private-lessons/${lesson.id}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_email: email.trim(),
          student_name: name.trim(),
          student_message: message.trim(),
          contact_info: { phone: phone.trim(), preferred_contact: "email" },
          availability_slot_id: slot.id,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (data?.code === "slot_taken") {
          setTaken((t) => new Set(t).add(slot.id));
          setSlotId(null);
          setStep("time");
          setError("That time was just booked by someone else. Nothing was charged. Pick another time.");
          return;
        }
        setError(data?.error ? `${data.error} Nothing was charged.` : "Couldn't start the booking. Try again.");
        return;
      }
      // The price the server will charge (it knows the membership for sure).
      setPayment({ clientSecret: data.clientSecret, stripeAccountId: data.stripeAccountId, price: data.lesson.price });
      setStep("pay");
    } catch {
      setError("Couldn't start the booking. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const steps: Array<[Step, string]> = [
    ["time", "Time"],
    ["details", "Details"],
    ["pay", "Payment"],
  ];
  const stepIndex = step === "done" ? 3 : steps.findIndex(([s]) => s === step);

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          if (step === "done") router.refresh();
          reset();
        }
        onOpenChange(next);
      }}
      title={step === "done" ? (outcome === "processing" ? "Payment processing" : "Payment received") : `Book ${lesson.title}`}
      width={680}
    >
      {step !== "done" && (
        <ol className="-mt-1 flex gap-1.5" aria-label="Steps">
          {steps.map(([s, label], i) => (
            <li
              key={s}
              aria-current={s === step ? "step" : undefined}
              className={cn("flex flex-1 flex-col gap-1.5 text-[12.5px] font-semibold", i === stepIndex ? "text-ink" : "text-ink-3")}
            >
              <span aria-hidden="true" className={cn("h-1 rounded-full transition-colors", i <= stepIndex ? "bg-brand" : "bg-surface-3")} />
              {label}
            </li>
          ))}
        </ol>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2.5 rounded-xl border border-live/30 bg-live-soft px-3.5 py-2.5 text-[14px] text-ink">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-live" aria-hidden="true" />
          {error}
        </p>
      )}

      {step === "time" &&
        (open_.length === 0 ? (
          <p className="rounded-xl bg-warn-soft px-4 py-3 text-[14px] text-warn">No open times in the next 30 days. Check back soon.</p>
        ) : (
          <>
            <div role="group" aria-label="Choose a day" className="scrollbar-hide -mx-0.5 flex snap-x gap-1.5 overflow-x-auto p-0.5">
              {days.map((d) => {
                const n = byDay.get(d)?.length ?? 0;
                const on = d === shownDay;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={n === 0}
                    aria-pressed={on}
                    aria-label={`${formatDayKey(d, "EEEE d MMMM")}, ${n === 0 ? "no times" : `${n} ${n === 1 ? "time" : "times"}`}`}
                    onClick={() => setDay(d)}
                    className={cn(
                      "flex w-16 shrink-0 snap-start flex-col items-center gap-0.5 rounded-xl border py-2 transition-colors",
                      on ? "border-brand bg-brand text-white" : "border-line bg-surface hover:border-line-strong",
                      n === 0 && "cursor-not-allowed bg-transparent opacity-45"
                    )}
                  >
                    <span className={cn("text-[12px] font-semibold", on ? "text-white" : "text-ink-3")}>{formatDayKey(d, "EEE")}</span>
                    <span className="font-display text-[20px] font-semibold leading-tight tabular-nums">{formatDayKey(d, "d")}</span>
                    <span className={cn("text-[11.5px] font-semibold", on ? "text-white" : n ? "text-brand-ink" : "font-medium text-ink-3")}>
                      {n ? `${n} open` : "No times"}
                    </span>
                  </button>
                );
              })}
            </div>
            {(["Morning", "Afternoon", "Evening"] as const).map((part) => {
              const list = (byDay.get(shownDay) ?? []).filter((s) => partOfDay(s.startsAt, timeZone) === part);
              if (!list.length) return null;
              return (
                <div key={part} className="flex flex-col gap-2">
                  <h4 className="text-[13px] font-semibold text-ink-2">{part}</h4>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
                    {list.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={s.id === slotId}
                        aria-label={`${formatDayKey(shownDay, "EEEE d MMMM")}, ${clock(s.startsAt, timeZone)}`}
                        onClick={() => setSlotId(s.id)}
                        className={cn(
                          "h-[42px] rounded-[10px] border text-[14.5px] font-semibold tabular-nums transition-colors active:scale-[.97]",
                          s.id === slotId ? "border-brand bg-brand text-white" : "border-line-strong bg-surface text-ink hover:border-brand hover:text-brand-ink"
                        )}
                      >
                        {clock(s.startsAt, timeZone)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="text-[13px] text-ink-3">Times are in your time zone. {lesson.durationMinutes} min each.</p>
          </>
        ))}

      {step === "details" && (
        <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="booking-name" className={FIELD_LABEL}>Your name</label>
              <input id="booking-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={FIELD_INPUT} />
            </div>
            <div>
              <label htmlFor="booking-email" className={FIELD_LABEL}>Email for the confirmation</label>
              <input id="booking-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={FIELD_INPUT} />
            </div>
          </div>
          <div>
            <label htmlFor="booking-message" className={FIELD_LABEL}>What would you like to work on? (optional)</label>
            <textarea
              id="booking-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1000}
              className={cn(FIELD_INPUT, "min-h-[84px] resize-y leading-[1.55]")}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setMessage((m) => (m.trim() ? `${m.trim()} ${s}.` : `${s}.`))}
                  className="h-[30px] rounded-full border border-line px-2.5 text-[13px] font-medium text-ink-2 transition-colors hover:border-brand-line hover:bg-brand-soft hover:text-brand-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="booking-phone" className={FIELD_LABEL}>Phone (optional)</label>
            <input id="booking-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" className={FIELD_INPUT} />
          </div>
        </div>
      )}

      {(step === "pay" || step === "details") && slot && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-xl bg-surface-2 px-4 py-3.5 text-[14.5px]">
          <dt className="text-ink-2">Lesson</dt>
          <dd className="text-right font-semibold text-ink">{lesson.title}</dd>
          <dt className="text-ink-2">When</dt>
          <dd className="text-right font-semibold tabular-nums text-ink">{when}</dd>
          <dt className="text-ink-2">Length</dt>
          <dd className="text-right font-semibold text-ink">{lesson.durationMinutes} min</dd>
          <div className="col-span-2 flex justify-between gap-4 border-t border-line-strong pt-2 text-[16px]">
            <dt className="text-ink-2">Total</dt>
            <dd className="font-semibold tabular-nums text-ink">{euro(payment?.price ?? price)}</dd>
          </div>
        </dl>
      )}

      {step === "pay" && payment && (
        <>
          <p className="flex items-start gap-2 text-[13.5px] text-ink-2">
            <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
            {describeCancellationPolicy(lesson.cutoffHours, lesson.latePolicy)}
          </p>
          <LessonPaymentInline
            clientSecret={payment.clientSecret}
            stripeAccountId={payment.stripeAccountId}
            price={payment.price}
            lessonTitle={lesson.title}
            communitySlug={slug}
            onSuccess={(o) => {
              setOutcome(o);
              setStep("done");
              if (slot) onBooked(slot.id);
            }}
          />
        </>
      )}

      {step === "done" && (
        <div className="flex flex-col items-center gap-3 py-3 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-ok-soft text-ok motion-safe:animate-pop-in">
            <Check className="h-8 w-8" strokeWidth={2.5} aria-hidden="true" />
          </span>
          <h3 className="font-display text-[22px] font-semibold text-ink">{outcome === "processing" ? "Your payment is processing" : "You're all set"}</h3>
          <p className="max-w-[44ch] text-[15px] text-ink-2">
            {outcome === "processing"
              ? "We'll email you as soon as your booking is confirmed. Don't pay again."
              : `${when}. Your lesson shows up on this page in a moment, and the confirmation is on its way to ${email}.`}
          </p>
          <button
            type="button"
            className={cn(BTN_PRIMARY, "mt-1")}
            onClick={() => {
              router.refresh();
              reset();
              onOpenChange(false);
            }}
          >
            Done
          </button>
        </div>
      )}

      {(step === "time" || step === "details") && (
        <div className="sticky bottom-0 -mx-[22px] -mb-[22px] mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-2.5 border-t border-line bg-surface px-[22px] py-3.5">
          <p className="min-w-[200px] flex-1 text-[14px] text-ink-2">
            {slot ? (
              <>
                <strong className="block text-[15px] text-ink">{when}</strong>
                {euro(price)}
                {price < lesson.regularPrice && <s className="ml-1.5 text-ink-3">{euro(lesson.regularPrice)}</s>}
              </>
            ) : (
              "Pick a time"
            )}
          </p>
          {step === "details" && (
            <button type="button" className={BTN_GHOST} onClick={() => setStep("time")}>
              Back
            </button>
          )}
          {step === "time" ? (
            <button type="button" className={BTN_PRIMARY} disabled={!slot} onClick={continueFromTime}>
              {viewer ? "Continue" : "Sign in to book"}
            </button>
          ) : (
            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={book}>
              {busy ? "One moment…" : "Continue to payment"}
            </button>
          )}
        </div>
      )}
    </AppDialog>
  );
}
