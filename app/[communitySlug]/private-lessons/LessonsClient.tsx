"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, Globe, Plus, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import CreatePrivateLessonModal from "@/components/CreatePrivateLessonModal";
import { AvailabilityTab } from "@/components/private-lessons/manage/AvailabilityTab";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/community-feed/feed-header";
import { AppDialog } from "@/components/ds/app-dialog";
import { InitialsAvatar } from "@/components/ds/initials-avatar";
import { city } from "@/components/community-calendar/format";
import { BookingDialog } from "@/components/community-lessons/booking-dialog";
import { LessonTypeCard } from "@/components/community-lessons/lesson-type-card";
import { OwnerBookings } from "@/components/community-lessons/owner-bookings";
import { YourLessons } from "@/components/community-lessons/your-lessons";
import type { LessonType } from "@/components/community-lessons/types";
import { useNow } from "@/hooks/use-now";
import { useViewerTimeZone } from "@/hooks/use-viewer-time-zone";
import { dateKeyInTz } from "@/lib/calendar-week";
import { lessonPaymentReturnNotice } from "@/lib/lesson-payment-return";
import type { OpenSlot, OwnerBooking, ViewerBooking } from "@/lib/private-lessons/data";
import { euro } from "@/lib/private-lessons/policy";
import { communityPath } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";

export interface LessonsClientProps {
  slug: string;
  teacher: { id: string; name: string; avatarUrl: string | null; timezone: string | null };
  isOwner: boolean;
  isMember: boolean;
  signedIn: boolean;
  viewer: { name: string; email: string } | null;
  viewerZone: string | null;
  lessons: LessonType[];
  slots: OpenSlot[];
  myBookings: ViewerBooking[];
  ownerBookings: OwnerBooking[];
  payoutsReady: boolean;
  membershipPrice: number | null;
  serverNow: number;
}

export default function LessonsClient({
  slug,
  teacher,
  isOwner,
  isMember,
  signedIn,
  viewer,
  viewerZone,
  lessons,
  slots,
  myBookings,
  ownerBookings,
  payoutsReady,
  membershipPrice,
  serverNow,
}: LessonsClientProps) {
  const router = useRouter();
  const now = useNow(60_000, serverNow) ?? new Date(serverNow);
  const timeZone = useViewerTimeZone(viewerZone);
  const [booking, setBooking] = useState<LessonType | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LessonType | null>(null);
  const [hoursOpen, setHoursOpen] = useState(false);

  // Back from a payment that needed a redirect (3-D Secure and the like).
  useEffect(() => {
    const notice = lessonPaymentReturnNotice(window.location.search);
    if (!notice) return;
    (notice.kind === "error" ? toast.error : toast.success)(notice.message);
    window.history.replaceState(null, "", window.location.pathname);
    router.refresh();
  }, [router]);

  const slotsFor = (l: LessonType) => slots.filter((s) => s.teacherId === l.teacherId);
  const visibleLessons = isOwner ? lessons : lessons.filter((l) => l.isActive);
  const anyOpen = visibleLessons.some((l) => slotsFor(l).length > 0);
  const discountFrom = visibleLessons
    .filter((l) => l.memberPrice != null && l.memberPrice > 0 && l.memberPrice < l.regularPrice)
    .sort((a, b) => a.memberPrice! - b.memberPrice!)[0];

  const stats = (() => {
    const monthKey = dateKeyInTz(now, timeZone).slice(0, 7);
    const out = new Map<string, { thisMonth: number; paidThisMonth: number; upcoming: number }>();
    for (const b of ownerBookings) {
      if (b.status === "canceled" || b.paymentStatus !== "succeeded" || !b.startsAt) continue;
      const s = out.get(b.lessonId) ?? { thisMonth: 0, paidThisMonth: 0, upcoming: 0 };
      if (dateKeyInTz(b.startsAt, timeZone).slice(0, 7) === monthKey) {
        s.thisMonth += 1;
        s.paidThisMonth += b.pricePaid;
      }
      if (new Date(b.startsAt).getTime() > now.getTime()) s.upcoming += 1;
      out.set(b.lessonId, s);
    }
    return out;
  })();

  const toggleVisible = async (l: LessonType) => {
    const res = await fetch(`/api/community/${encodeURIComponent(slug)}/private-lessons/${l.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !l.isActive }),
    });
    if (!res.ok) return void toast.error("Couldn't change that. Try again.");
    toast.success(l.isActive ? "Hidden from members" : "Visible to members");
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-[1160px] px-4 pb-12 pt-4 sm:px-6 sm:pb-[72px] sm:pt-7">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-[28px] font-semibold leading-[1.1] tracking-[-0.015em] text-ink sm:text-[32px]">Private lessons</h1>
          <div className="flex items-center gap-3">
            <InitialsAvatar id={teacher.id} name={teacher.name} imageUrl={teacher.avatarUrl} size={44} />
            <div>
              <strong className="block text-[15px] text-ink">One on one with {teacher.name}</strong>
              <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-3">
                <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                Times in your time zone ({city(timeZone)})
              </span>
            </div>
          </div>
        </div>
        {isOwner && (
          <div id="manage-private-lessons" className="flex flex-wrap gap-2">
            <button type="button" className={cn(BTN_SECONDARY, "h-11 px-[18px] text-[15px]")} onClick={() => setHoursOpen(true)}>
              <CalendarClock aria-hidden="true" />
              Open times
            </button>
            <button type="button" className={cn(BTN_PRIMARY, "h-11 px-[18px] text-[15px]")} onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" />
              Add lesson type
            </button>
          </div>
        )}
      </div>

      {isOwner && !payoutsReady && (
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3.5">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warn" aria-hidden="true" />
          <p className="min-w-[240px] flex-1 text-[14px] text-ink">
            <strong className="block">Members can&apos;t pay for lessons yet</strong>
            Set up payouts so lesson payments reach you.
          </p>
          <Link href={communityPath(slug, "/admin")} className={BTN_SECONDARY}>
            Set up payouts
          </Link>
        </div>
      )}
      {isOwner && visibleLessons.length > 0 && !anyOpen && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3.5">
          <CalendarClock className="h-5 w-5 shrink-0 text-warn" aria-hidden="true" />
          <p className="min-w-[240px] flex-1 text-[14px] text-ink">
            <strong className="block">Members can&apos;t book right now</strong>
            You have no open times in the next 30 days. Add a few so members can pick one.
          </p>
          <button type="button" className={BTN_SECONDARY} onClick={() => setHoursOpen(true)}>
            Add open times
          </button>
        </div>
      )}

      {!isOwner && !isMember && discountFrom && membershipPrice != null && (
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3.5 rounded-2xl border border-brand-line bg-brand-soft px-[18px] py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface text-brand-ink">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="min-w-[260px] flex-1 text-[14.5px] text-ink-2">
            <strong className="block text-[15.5px] text-ink">Members pay less</strong>
            {discountFrom.title} is {euro(discountFrom.memberPrice!)} for members instead of {euro(discountFrom.regularPrice)}.
            {membershipPrice > 0 ? ` Membership is ${euro(membershipPrice)} a month.` : " Joining is free."}
          </p>
          <Link href={communityPath(slug, "/about")} className={BTN_PRIMARY}>
            See membership
          </Link>
        </div>
      )}

      {!isOwner && <YourLessons bookings={myBookings} teacherName={teacher.name} teacherZone={teacher.timezone} timeZone={timeZone} now={now} />}
      {isOwner && <OwnerBookings bookings={ownerBookings} timeZone={timeZone} now={now} />}

      <section aria-labelledby="lesson-types" className="mt-8 flex flex-col gap-3.5">
        <h2 id="lesson-types" className="font-display text-[19px] font-semibold text-ink">
          {isOwner ? "Lesson types" : "Book a lesson"}
        </h2>
        {!isOwner && visibleLessons.length > 0 && !anyOpen && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[14px] text-ink">
            <span>{teacher.name} has no open times right now. New times show up here as soon as they&apos;re added.</span>
            <Link href={communityPath(slug)} className="font-semibold text-brand-ink hover:underline hover:underline-offset-[3px]">
              Ask in the community
            </Link>
          </p>
        )}
        {visibleLessons.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
            <h3 className="font-display text-[20px] font-semibold text-ink">{isOwner ? "Offer your first private lesson" : "No private lessons yet"}</h3>
            <p className="max-w-[48ch] text-[15px] text-ink-2">
              {isOwner
                ? "Set a length and a price (members can pay less), add open times, and members book and pay here."
                : `When ${teacher.name} offers private lessons, you can book them here.`}
            </p>
            {isOwner && (
              <button type="button" className={cn(BTN_PRIMARY, "mt-1.5")} onClick={() => setCreating(true)}>
                <Plus aria-hidden="true" />
                Add lesson type
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-5">
            {visibleLessons.map((l) => (
              <LessonTypeCard
                key={l.id}
                lesson={l}
                isMember={isMember}
                slots={slotsFor(l)}
                timeZone={timeZone}
                now={now}
                isOwner={isOwner}
                stats={stats.get(l.id) ?? { thisMonth: 0, paidThisMonth: 0, upcoming: 0 }}
                onBook={() => setBooking(l)}
                onEdit={() => setEditing(l)}
                onToggleVisible={() => toggleVisible(l)}
              />
            ))}
          </div>
        )}
      </section>

      {booking && (
        <BookingDialog
          open
          onOpenChange={(o) => !o && setBooking(null)}
          slug={slug}
          lesson={booking}
          isMember={isMember}
          slots={slotsFor(booking)}
          viewer={signedIn ? viewer : null}
          timeZone={timeZone}
          todayKey={dateKeyInTz(now, timeZone)}
        />
      )}

      {isOwner && (
        <>
          <CreatePrivateLessonModal
            isOpen={creating || !!editing}
            onClose={() => {
              setCreating(false);
              setEditing(null);
            }}
            communitySlug={slug}
            editingLesson={
              editing
                ? {
                    id: editing.id,
                    title: editing.title,
                    description: editing.description ?? "",
                    duration_minutes: editing.durationMinutes,
                    regular_price: editing.regularPrice,
                    member_price: editing.memberPrice ?? undefined,
                    location_type: editing.locationType,
                    requirements: editing.requirements ?? "",
                    max_bookings_per_month: editing.maxPerMonth ?? undefined,
                    cancellation_cutoff_hours: editing.cutoffHours,
                    late_refund_policy: editing.latePolicy,
                    is_active: editing.isActive,
                  }
                : undefined
            }
            onSuccess={() => {
              setCreating(false);
              setEditing(null);
              router.refresh();
            }}
          />
          <AppDialog
            open={hoursOpen}
            onOpenChange={(o) => {
              setHoursOpen(o);
              if (!o) router.refresh();
            }}
            title="Open times"
            description={`Each open time is one lesson start, in ${city(teacher.timezone ?? timeZone)} time. Members see them in their own time zone.`}
            width={720}
          >
            <AvailabilityTab communitySlug={slug} />
          </AppDialog>
        </>
      )}
    </div>
  );
}
