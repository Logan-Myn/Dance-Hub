"use client";

import { AlertCircle, Compass, Settings, Users, Video } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { formatInTz, tzOffsetLabel } from '@/lib/timezone';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { LessonBookingWithDetails } from "@/types/private-lessons";
import { CancelLessonModal } from "@/components/CancelLessonModal";
import { CommunityCard } from "@/components/dashboard/CommunityCard";
import { NextLessonCard } from "@/components/dashboard/NextLessonCard";
import { StartCommunityLink } from "@/components/StartCommunityLink";
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY } from "@/components/community-feed/feed-header";
import { EmptyState } from "@/components/ds/empty-state";
import { InitialsAvatar } from "@/components/ds/initials-avatar";
import { Skeleton } from "@/components/ds/skeleton";
import { cn } from "@/lib/utils";

interface Community {
  id: string;
  name: string;
  slug: string;
  description: string;
  image_url: string | null;
  image_focal_x: number | null;
  image_focal_y: number | null;
  image_zoom: string | number | null;
  created_by: string;
  members_count: number;
  created_at: string;
}

interface UserProfile {
  id: string;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: isAuthLoading } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [bookings, setBookings] = useState<LessonBookingWithDetails[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [cancelTarget, setCancelTarget] = useState<LessonBookingWithDetails | null>(null);

  const userTimezone = useUserTimezone();

  const { data: communities, error, isLoading: isDataLoading } = useSWR<Community[]>(
    user ? `user-communities:${user.id}` : null,
    fetcher,
    { revalidateOnFocus: true, revalidateOnMount: true }
  );

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Fetch bookings and profile
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/profile?userId=${user.id}`);
        if (response.ok && !cancelled) setProfile(await response.json());
      } catch (error) {
        console.error('Error fetching profile:', error);
      }
    })();
    (async () => {
      try {
        const response = await fetch('/api/bookings');
        if (response.ok && !cancelled) setBookings(await response.json());
      } catch (error) {
        console.error('Error fetching bookings:', error);
      } finally {
        if (!cancelled) setIsLoadingBookings(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push('/');
    }
  }, [user, isAuthLoading, router]);

  if (isAuthLoading) {
    return null;
  }

  if (!user) {
    return null;
  }

  const isLoading = isDataLoading || isLoadingBookings;

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-[960px] flex-col gap-6 px-4 py-8 sm:px-6" aria-busy="true">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="h-28 rounded-2xl" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      </div>
    );
  }

  // Greeting and dates in the viewer's saved time zone, so they agree.
  const getGreeting = () => {
    const hour = Number(formatInTz(currentTime, userTimezone, 'H'));
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const getUserDisplayName = () => {
    // Priority: display_name > full_name > user.name > email prefix
    if (profile?.display_name) return profile.display_name;
    if (profile?.full_name) return profile.full_name;
    if (user?.name) return user.name;
    return user?.email?.split('@')[0] || 'Dancer';
  };

  // lesson_status only flips to 'completed' / 'canceled' on explicit action,
  // so we also need to consider scheduled_at + duration to know if a lesson
  // has already ended. Otherwise past lessons keep showing as 'Upcoming'.
  // The page's clock (ticks every minute), not a fresh Date.now() per render.
  const nowMs = currentTime.getTime();
  const GRACE_MS = 15 * 60_000;
  const isLessonOver = (booking: LessonBookingWithDetails) => {
    if (['completed', 'canceled'].includes(booking.lesson_status)) return true;
    if (!booking.scheduled_at) return false;
    const startMs = new Date(booking.scheduled_at).getTime();
    const endMs = startMs + (booking.duration_minutes ?? 60) * 60_000;
    return nowMs > endMs + GRACE_MS;
  };

  function expectedRefundCents(
    pricePaid: number,
    scheduledAtIso: string | null,
    cutoffHours: number,
    latePolicy: 'refund' | 'no_refund',
    role: 'student' | 'teacher'
  ): number {
    // Teacher-initiated cancellations always refund in full (mirrors cancel route).
    if (role === 'teacher') return Math.round(pricePaid * 100);
    if (!scheduledAtIso) return Math.round(pricePaid * 100);
    const scheduledMs = new Date(scheduledAtIso).getTime();
    const cutoffMs = scheduledMs - cutoffHours * 3600_000;
    const beforeCutoff = nowMs <= cutoffMs;
    if (beforeCutoff || latePolicy === 'refund') {
      return Math.round(pricePaid * 100);
    }
    return 0;
  }

  // Get upcoming lessons (paid, not completed/canceled, and still in the future
  // or currently live within the grace window).
  const upcomingLessons = bookings
    .filter(b => b.payment_status === 'succeeded' && !isLessonOver(b))
    .sort((a, b) => {
      if (!a.scheduled_at) return 1;
      if (!b.scheduled_at) return -1;
      return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
    });

  const nextLesson = upcomingLessons[0];

  const canJoinVideo = (booking: LessonBookingWithDetails) => {
    if (booking.payment_status !== 'succeeded') return false;
    if (isLessonOver(booking)) return false;

    const scheduledAt = booking.scheduled_at ? new Date(booking.scheduled_at) : null;
    if (scheduledAt) {
      const fifteenMinutesBefore = new Date(scheduledAt.getTime() - 15 * 60 * 1000);
      return nowMs >= fifteenMinutesBefore.getTime();
    }
    return true;
  };

  const dayKey = (d: Date) => formatInTz(d, userTimezone, 'yyyy-MM-dd');
  const formatLessonDate = (dateString: string | undefined) => {
    if (!dateString) return 'Flexible timing';
    const date = new Date(dateString);
    const today = dayKey(currentTime);
    const tomorrow = dayKey(new Date(currentTime.getTime() + 86_400_000));
    const time = formatInTz(date, userTimezone, 'HH:mm');
    if (dayKey(date) === today) return `Today at ${time}`;
    if (dayKey(date) === tomorrow) return `Tomorrow at ${time}`;
    return `${formatInTz(date, userTimezone, 'EEE d MMM')}, ${time}`;
  };

  const getTimeUntil = (dateString: string | undefined) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    if (date <= now) return 'starting now';
    return formatDistanceToNow(date, { addSuffix: true });
  };

  const displayName = getUserDisplayName();
  const owned = communities?.filter((c) => c.created_by === user.id) ?? [];
  const joined = communities?.filter((c) => c.created_by !== user.id) ?? [];
  const ordered = [...owned, ...joined];

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex max-w-[960px] flex-col gap-8 px-4 pb-16 pt-6 sm:px-6 sm:pt-9">
        <header className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <InitialsAvatar id={user.id} name={displayName} imageUrl={profile?.avatar_url || user?.image || null} size={56} />
            <div className="min-w-0">
              <h1 className="text-balance font-display text-[23px] font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[30px]">
                {getGreeting()}, {displayName.split(' ')[0]}
              </h1>
              <p className="mt-0.5 text-[14.5px] text-ink-2">{formatInTz(currentTime, userTimezone, 'EEEE d MMMM')}</p>
            </div>
          </div>
          <Link href="/dashboard/settings" className={cn(BTN_SECONDARY, "w-10 px-0 sm:w-auto sm:px-3.5")}>
            <Settings aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Settings</span>
          </Link>
        </header>

        {nextLesson && (
          <NextLessonCard
            booking={nextLesson}
            canJoinVideo={canJoinVideo(nextLesson)}
            timeUntil={getTimeUntil(nextLesson.scheduled_at)}
            formattedDate={formatLessonDate(nextLesson.scheduled_at)}
            timeZone={userTimezone}
            onCancel={() => setCancelTarget(nextLesson)}
          />
        )}

        {upcomingLessons.length > 1 && (
          <section aria-labelledby="upcoming-h" className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="upcoming-h" className="font-display text-[19px] font-semibold text-ink">
                Upcoming lessons
              </h2>
              <span className="text-[13px] text-ink-3">Times in {tzOffsetLabel(userTimezone)}</span>
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              {upcomingLessons.slice(1).map((booking) => (
                <li key={booking.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
                  <span aria-hidden="true" className="hidden h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand-soft text-brand-ink sm:grid">
                    <Video className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-[15px] font-semibold text-ink">{booking.lesson_title}</strong>
                    <span className="text-[13px] tabular-nums text-ink-3">
                      {formatLessonDate(booking.scheduled_at)},{" "}
                      {booking.viewer_role === 'teacher' ? `with ${booking.student_name || booking.student_email}` : booking.community_name}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {canJoinVideo(booking) && (
                      <Link href={`/video-session/${booking.id}`} className={cn(BTN_PRIMARY, "h-9")}>
                        Join
                      </Link>
                    )}
                    <button type="button" onClick={() => setCancelTarget(booking)} className={cn(BTN_GHOST, "h-9")}>
                      Cancel
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="communities-h" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="communities-h" className="font-display text-[19px] font-semibold text-ink">
              Your communities
            </h2>
            {ordered.length > 0 && (
              <Link href="/discovery" className="text-[13.5px] font-semibold text-brand-ink hover:underline hover:underline-offset-[3px]">
                Find more
              </Link>
            )}
          </div>
          {ordered.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ordered.map((community) => (
                <CommunityCard key={community.id} community={community} isAdmin={community.created_by === user.id} />
              ))}
            </div>
          ) : !error ? (
            <EmptyState
              icon={<Users className="h-7 w-7" />}
              title="You're not in a community yet"
              actions={
                <>
                  <Link href="/discovery" className={BTN_PRIMARY}>
                    <Compass aria-hidden="true" />
                    Find a community
                  </Link>
                  <StartCommunityLink className={BTN_SECONDARY}>Create your own</StartCommunityLink>
                </>
              }
            >
              Join a teacher&apos;s community to take classes and courses, or start one for your own students.
            </EmptyState>
          ) : null}
        </section>

        {error && (
          <p role="alert" className="flex items-center gap-3 rounded-2xl border border-live/25 bg-live-soft px-4 py-3 text-[14px] text-live">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            Couldn&apos;t load your communities. Reload the page to try again.
          </p>
        )}
      </div>

      {cancelTarget && (
        <CancelLessonModal
          isOpen={!!cancelTarget}
          onClose={() => setCancelTarget(null)}
          onCancelled={() => {
            setBookings((prev) => prev.filter((b) => b.id !== cancelTarget.id));
            setCancelTarget(null);
          }}
          bookingId={cancelTarget.id}
          lessonTitle={cancelTarget.lesson_title}
          scheduledAtIso={cancelTarget.scheduled_at ?? null}
          currency="EUR"
          role={cancelTarget.viewer_role}
          expectedRefundCents={expectedRefundCents(
            Number(cancelTarget.price_paid),
            cancelTarget.scheduled_at ?? null,
            cancelTarget.cancellation_cutoff_hours,
            cancelTarget.late_refund_policy,
            cancelTarget.viewer_role
          )}
        />
      )}
    </div>
  );
}
