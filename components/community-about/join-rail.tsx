"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, Check, Eye, Link2 } from "lucide-react";
import { BTN_PRIMARY, BTN_SECONDARY, copyInviteLink } from "@/components/community-feed/feed-header";
import { clock } from "@/components/community-calendar/format";
import { euro } from "@/lib/private-lessons/policy";
import { communityPath } from "@/lib/safe-redirect";
import { relativeDayWord } from "@/lib/time/format";
import { cn } from "@/lib/utils";
import { inSentence, type AboutCtx } from "./view-blocks";

export type Plan = "monthly" | "yearly";

export interface JoinState {
  status: "active" | "pre_registration" | "inactive";
  openingDate: string | null;
  isMember: boolean;
  isPreRegistered: boolean;
  canceling: boolean;
  accessEndDate: string | null;
}

const CARD = "flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-5 shadow-raised";

function perks(ctx: AboutCtx): string[] {
  return [
    ctx.offered.liveClasses ? "Live classes, and the calendar of what's next" : null,
    ctx.offered.courses && ctx.data.course ? "Every course in the Classroom" : null,
    ctx.offered.courses && (ctx.data.course?.replayCount ?? 0) > 0 ? "Replays of past live classes" : null,
    ctx.offered.privateLessons && ctx.data.lessons.some((l) => l.memberPrice != null) ? "Member prices on private lessons" : null,
    "The community feed: questions, feedback, progress",
  ].filter(Boolean) as string[];
}

/** The join card: price, plan switch, what's included, Join. */
export function JoinCard({
  ctx,
  state,
  plan,
  onPlan,
  onJoin,
  isJoining,
}: {
  ctx: AboutCtx;
  state: JoinState;
  plan: Plan;
  onPlan: (p: Plan) => void;
  onJoin: () => void;
  isJoining: boolean;
}) {
  const { pricing } = ctx;
  if (state.status === "inactive") {
    return (
      <div className={CARD}>
        <h2 className="font-display text-[19px] font-semibold text-ink">Not taking new members</h2>
        <p className="text-[14.5px] text-ink-2">{ctx.communityName} isn&apos;t open to new members right now.</p>
      </div>
    );
  }
  if (state.isPreRegistered) {
    return (
      <div className={CARD}>
        <h2 className="font-display text-[19px] font-semibold text-ink">You&apos;re pre-registered</h2>
        <p className="text-[14.5px] text-ink-2">
          {state.openingDate
            ? `It opens ${new Date(state.openingDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: ctx.timeZone })}. You're charged then, not before.`
            : "You're charged when it opens, not before."}
        </p>
        <Link href={communityPath(ctx.slug)} className={BTN_SECONDARY}>
          See what&apos;s coming
        </Link>
      </div>
    );
  }
  const pre = state.status === "pre_registration";
  const yearly = !pre && pricing.yearly != null;
  const saving = yearly ? pricing.monthly * 12 - pricing.yearly! : 0;
  const amount = plan === "yearly" && yearly ? pricing.yearly! : pricing.monthly;

  return (
    <div className={CARD}>
      {pricing.paid && yearly && (
        <div role="radiogroup" aria-label="Plan" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
          {(["monthly", "yearly"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={plan === p}
              onClick={() => onPlan(p)}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-1.5 rounded-[9px] text-[14px] font-semibold transition-colors",
                plan === p ? "bg-surface text-ink shadow-card" : "text-ink-2"
              )}
            >
              {p === "monthly" ? "Monthly" : "Yearly"}
              {p === "yearly" && saving > 0 && <span className="rounded-full bg-ok-soft px-1.5 py-0.5 text-[11.5px] font-bold text-ok">Save {euro(saving)}</span>}
            </button>
          ))}
        </div>
      )}
      {pre && (
        <p className="flex items-center gap-2.5 rounded-[10px] bg-brand-soft px-3 py-2.5 text-[14px] font-semibold text-brand-ink">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          {state.openingDate
            ? `Opens ${new Date(state.openingDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: ctx.timeZone })}`
            : "Opening soon"}
        </p>
      )}
      <div>
        <p className="flex flex-wrap items-baseline gap-1.5 tabular-nums">
          <b className="font-display text-[40px] font-semibold leading-none tracking-[-0.02em] text-ink">{pricing.paid ? euro(amount) : "Free"}</b>
          {pricing.paid && <span className="text-[15px] text-ink-2">{plan === "yearly" && yearly ? "a year" : "a month"}</span>}
        </p>
        <p className="mt-1.5 text-[13.5px] text-ink-2">
          {!pricing.paid
            ? "No card needed."
            : pre
              ? "Nothing is charged today. You're charged when it opens."
              : plan === "yearly" && yearly
                ? `That's ${euro(Math.round((pricing.yearly! / 12) * 100) / 100)} a month. Cancel anytime.`
                : "Cancel anytime."}
        </p>
      </div>
      <ul className="flex flex-col gap-[9px] text-[14.5px] text-ink">
        {perks(ctx).map((p) => (
          <li key={p} className="flex items-start gap-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
            {p}
          </li>
        ))}
      </ul>
      <button type="button" disabled={isJoining} onClick={onJoin} className={cn(BTN_PRIMARY, "h-11 w-full text-[15px]")}>
        {isJoining ? "One moment…" : pre ? "Pre-register" : pricing.paid ? `Join for ${euro(amount)}` : "Join for free"}
      </button>
      {pricing.paid && <p className="text-center text-[12.5px] text-ink-3">Have a promo code? Add it at checkout.</p>}
    </div>
  );
}

/** For members: what's next, a way in, and the invite link. */
export function MemberCard({ ctx, state }: { ctx: AboutCtx; state: JoinState }) {
  const next = ctx.data.upcoming[0];
  return (
    <div className={CARD}>
      <h2 className="font-display text-[19px] font-semibold text-ink">You&apos;re a member</h2>
      {state.canceling && state.accessEndDate && (
        <p className="rounded-[10px] bg-warn-soft px-3 py-2.5 text-[14px] text-warn">
          Your membership ends {new Date(state.accessEndDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: ctx.timeZone })}. You can rejoin from the community page before then.
        </p>
      )}
      {next && (
        <p className="text-[14.5px] text-ink-2">
          Next live class: <strong className="text-ink">{next.title}</strong>, {inSentence(relativeDayWord(next.startsAt, ctx.now, ctx.timeZone, "en-GB"))} at {clock(next.startsAt, ctx.timeZone)}.
        </p>
      )}
      <Link href={communityPath(ctx.slug)} className={cn(BTN_PRIMARY, "w-full")}>
        Go to the community
        <ArrowRight aria-hidden="true" />
      </Link>
      <button type="button" className={cn(BTN_SECONDARY, "w-full")} onClick={() => copyInviteLink(ctx.slug)}>
        <Link2 aria-hidden="true" />
        Invite a friend
      </button>
    </div>
  );
}

/** For the owner: what makes the page complete, and a visitor preview. */
export function OwnerChecklist({
  items,
  previewing,
  onPreview,
}: {
  items: Array<{ label: string; done: boolean; href?: string; onFix?: () => void }>;
  previewing: boolean;
  onPreview: () => void;
}) {
  const done = items.filter((i) => i.done).length;
  return (
    <div className={CARD}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-[17px] font-semibold text-ink">Page checklist</h2>
        <span className="text-[13px] tabular-nums text-ink-2">
          {done} of {items.length}
        </span>
      </div>
      <span className="block h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
        <span className="block h-full rounded-full bg-ok transition-[width] duration-500" style={{ width: `${(done / items.length) * 100}%` }} />
      </span>
      <ul className="flex flex-col">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-2.5 border-t border-line py-2 text-[14px] first:border-t-0">
            <span
              aria-hidden="true"
              className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", i.done ? "border-ok bg-ok text-white" : "border-line-strong")}
            >
              {i.done && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            <span className={cn("min-w-0 flex-1", i.done ? "text-ink-2" : "text-ink")}>
              <span className="sr-only">{i.done ? "Done: " : "To do: "}</span>
              {i.label}
            </span>
            {!i.done && i.onFix && (
              <button type="button" onClick={i.onFix} className="text-[13px] font-semibold text-brand-ink hover:underline hover:underline-offset-[3px]">
                Add
              </button>
            )}
            {!i.done && !i.onFix && i.href && (
              <Link href={i.href} className="text-[13px] font-semibold text-brand-ink hover:underline hover:underline-offset-[3px]">
                Set up
              </Link>
            )}
          </li>
        ))}
      </ul>
      <button type="button" aria-pressed={previewing} className={cn(BTN_SECONDARY, "w-full")} onClick={onPreview}>
        <Eye aria-hidden="true" />
        {previewing ? "Back to editing" : "See it as a visitor"}
      </button>
    </div>
  );
}

/** The last call to action at the end of the page. */
export function FinalCta({
  title,
  text,
  label,
  onJoin,
  isJoining,
}: {
  title: string;
  text: string;
  label: string;
  onJoin: () => void;
  isJoining: boolean;
}) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-[20px] border border-brand-line bg-brand-soft p-6">
      <div className="min-w-0">
        <h2 className="text-balance font-display text-[22px] font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-[15px] text-ink-2">{text}</p>
      </div>
      <button type="button" disabled={isJoining} onClick={onJoin} className={cn(BTN_PRIMARY, "h-11 px-[18px] text-[15px]")}>
        {label}
      </button>
    </section>
  );
}

/** Phones: the price and Join, always in reach, above the tab bar. */
export function MobileJoinBar({ price, sub, label, onJoin, isJoining }: { price: string; sub: string; label: string; onJoin: () => void; isJoining: boolean }) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur-md lg:hidden">
      <p className="min-w-0 flex-1 text-[13px] text-ink-2">
        <b className="block font-display text-[18px] font-semibold leading-tight tabular-nums text-ink">{price}</b>
        {sub}
      </p>
      <button type="button" disabled={isJoining} onClick={onJoin} className={BTN_PRIMARY}>
        {label}
      </button>
    </div>
  );
}

export function usePlan(initial: Plan): [Plan, (p: Plan) => void] {
  return useState<Plan>(initial);
}
