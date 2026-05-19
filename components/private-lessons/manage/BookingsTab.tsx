"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { CancelLessonModal } from '@/components/CancelLessonModal';
import { groupBookings, type BookingGroup } from '@/lib/booking-grouping';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { BookingRow } from './BookingRow';
import { BookingDetailsSheet } from './BookingDetailsSheet';
import type { LessonBookingWithDetails } from '@/types/private-lessons';

interface BookingsTabProps {
  communitySlug: string;
}

const GRACE_MS = 15 * 60_000;

function canJoinVideoFor(booking: LessonBookingWithDetails): boolean {
  if (booking.payment_status !== 'succeeded') return false;
  if (!booking.daily_room_name) return false;
  if (booking.lesson_status === 'canceled' || booking.lesson_status === 'completed')
    return false;
  if (!booking.scheduled_at) return true;
  const start = new Date(booking.scheduled_at).getTime();
  const end = start + (booking.duration_minutes ?? 60) * 60_000;
  const fifteenBefore = start - 15 * 60_000;
  return Date.now() >= fifteenBefore && Date.now() <= end + GRACE_MS;
}

function expectedRefundCents(
  booking: LessonBookingWithDetails,
): number {
  const pricePaid = Number(booking.price_paid);
  if (booking.viewer_role === 'teacher') return Math.round(pricePaid * 100);
  if (!booking.scheduled_at) return Math.round(pricePaid * 100);
  const scheduledMs = new Date(booking.scheduled_at).getTime();
  const cutoffMs =
    scheduledMs - (booking.cancellation_cutoff_hours ?? 24) * 3600_000;
  const beforeCutoff = Date.now() <= cutoffMs;
  if (beforeCutoff || booking.late_refund_policy === 'refund') {
    return Math.round(pricePaid * 100);
  }
  return 0;
}

interface SectionProps {
  title: string;
  count: number;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}

function Section({ title, count, collapsible, defaultCollapsed, children }: SectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);
  if (count === 0) return null;
  return (
    <section className="border border-border/50 rounded-2xl bg-card overflow-hidden">
      <button
        type="button"
        onClick={collapsible ? () => setCollapsed(c => !c) : undefined}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        <span className="flex items-center gap-2">
          {collapsible &&
            (collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            ))}
          {title}
        </span>
        <span>{count}</span>
      </button>
      {!collapsed && <div className="divide-y divide-border/50">{children}</div>}
    </section>
  );
}

export function BookingsTab({ communitySlug }: BookingsTabProps) {
  const tz = useUserTimezone();
  const [bookings, setBookings] = useState<LessonBookingWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  const [selected, setSelected] = useState<LessonBookingWithDetails | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<LessonBookingWithDetails | null>(null);

  const fetchBookings = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/community/${communitySlug}/lesson-bookings`);
      if (res.ok) setBookings(await res.json());
    } catch (e) {
      console.error('Failed to load bookings', e);
    } finally {
      setIsLoading(false);
    }
  }, [communitySlug]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Refresh "now" every minute so Join-button visibility stays current.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const groups: BookingGroup = useMemo(
    () => groupBookings(bookings, now, tz),
    [bookings, now, tz],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
        No bookings yet. Students will appear here when they reserve a lesson.
      </div>
    );
  }

  const renderRow = (booking: LessonBookingWithDetails) => (
    <BookingRow
      key={booking.id}
      booking={booking}
      canJoinVideo={canJoinVideoFor(booking)}
      onOpen={() => {
        setSelected(booking);
        setSheetOpen(true);
      }}
      onCancel={() => setCancelTarget(booking)}
    />
  );

  return (
    <>
      <div className="space-y-4">
        <Section title="Today" count={groups.today.length}>
          {groups.today.map(renderRow)}
        </Section>
        <Section title="This week" count={groups.thisWeek.length}>
          {groups.thisWeek.map(renderRow)}
        </Section>
        <Section title="Upcoming" count={groups.upcoming.length}>
          {groups.upcoming.map(renderRow)}
        </Section>
        <Section
          title="Past"
          count={groups.past.length}
          collapsible
          defaultCollapsed
        >
          {groups.past.map(renderRow)}
        </Section>
        <Section
          title="Canceled"
          count={groups.canceled.length}
          collapsible
          defaultCollapsed
        >
          {groups.canceled.map(renderRow)}
        </Section>
      </div>

      <BookingDetailsSheet
        booking={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        canJoinVideo={selected ? canJoinVideoFor(selected) : false}
        onCancel={() => {
          if (selected) setCancelTarget(selected);
          setSheetOpen(false);
        }}
      />

      {cancelTarget && (
        <CancelLessonModal
          isOpen={!!cancelTarget}
          onClose={() => setCancelTarget(null)}
          onCancelled={() => {
            setCancelTarget(null);
            fetchBookings();
          }}
          bookingId={cancelTarget.id}
          lessonTitle={cancelTarget.lesson_title}
          scheduledAtIso={cancelTarget.scheduled_at ?? null}
          currency="EUR"
          role={cancelTarget.viewer_role}
          expectedRefundCents={expectedRefundCents(cancelTarget)}
        />
      )}
    </>
  );
}
