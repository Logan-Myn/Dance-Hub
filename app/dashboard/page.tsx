"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Clock,
  Video,
  ChevronRight,
  Settings,
  Sparkles,
  Users,
  CheckCircle,
  AlertCircle
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { format, isToday, isTomorrow, formatDistanceToNow } from 'date-fns';
import { LessonBookingWithDetails } from "@/types/private-lessons";
import { cn } from "@/lib/utils";

interface Community {
  id: string;
  name: string;
  slug: string;
  description: string;
  image_url: string;
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
    if (user) {
      fetchBookings();
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    try {
      const response = await fetch(`/api/profile?userId=${user?.id}`);
      if (response.ok) {
        const data = await response.json();
        setProfile(data);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const fetchBookings = async () => {
    try {
      const response = await fetch('/api/bookings');
      if (!response.ok) return;
      const data = await response.json();
      setBookings(data);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setIsLoadingBookings(false);
    }
  };

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
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        </div>
      </div>
    );
  }

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const getUserInitials = () => {
    const name = profile?.display_name || profile?.full_name || user?.name;
    if (name) {
      const parts = name.split(' ');
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return name.substring(0, 2).toUpperCase();
    }
    return user?.email ? user.email.substring(0, 2).toUpperCase() : 'U';
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
  const GRACE_MS = 15 * 60_000;
  const isLessonOver = (booking: LessonBookingWithDetails) => {
    if (['completed', 'canceled'].includes(booking.lesson_status)) return true;
    if (!booking.scheduled_at) return false;
    const startMs = new Date(booking.scheduled_at).getTime();
    const endMs = startMs + (booking.duration_minutes ?? 60) * 60_000;
    return Date.now() > endMs + GRACE_MS;
  };

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
    if (!booking.daily_room_name) return false;
    if (isLessonOver(booking)) return false;

    const scheduledAt = booking.scheduled_at ? new Date(booking.scheduled_at) : null;
    if (scheduledAt) {
      const fifteenMinutesBefore = new Date(scheduledAt.getTime() - 15 * 60 * 1000);
      return Date.now() >= fifteenMinutesBefore.getTime();
    }
    return true;
  };

  const formatLessonDate = (dateString: string | undefined) => {
    if (!dateString) return 'Flexible timing';
    const date = new Date(dateString);
    if (isToday(date)) return `Today at ${format(date, 'h:mm a')}`;
    if (isTomorrow(date)) return `Tomorrow at ${format(date, 'h:mm a')}`;
    return format(date, 'EEE, MMM d · h:mm a');
  };

  const getTimeUntil = (dateString: string | undefined) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    if (date <= now) return 'Starting now';
    return formatDistanceToNow(date, { addSuffix: true });
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Header with Greeting */}
        <header className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14 ring-2 ring-primary/20 ring-offset-2 ring-offset-background">
              <AvatarImage src={profile?.avatar_url || user?.image || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-lg font-display font-semibold">
                {getUserInitials()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-semibold text-foreground">
                {getGreeting()}, {getUserDisplayName()}
              </h1>
              <p className="text-muted-foreground text-sm flex items-center gap-1.5 mt-0.5">
                <Calendar className="h-3.5 w-3.5" />
                {format(currentTime, 'EEEE, MMMM d')}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full hover:bg-muted"
            asChild
          >
            <Link href="/dashboard/settings">
              <Settings className="h-5 w-5 text-muted-foreground" />
            </Link>
          </Button>
        </header>

        {/* Next Lesson Hero Card */}
        {nextLesson ? (
          <section
            className={cn(
              "relative overflow-hidden rounded-2xl p-6",
              "bg-gradient-to-br from-primary/90 via-primary to-accent",
              "text-primary-foreground shadow-lg",
              "transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5"
            )}
          >
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm font-medium text-white/90">Next Lesson</span>
                {nextLesson.scheduled_at && (
                  <Badge className="bg-white/20 text-white border-0 text-xs ml-auto">
                    {getTimeUntil(nextLesson.scheduled_at)}
                  </Badge>
                )}
              </div>

              <h2 className="font-display text-xl md:text-2xl font-semibold mb-1">
                {nextLesson.lesson_title}
              </h2>

              <p className="text-white/80 text-sm mb-4">
                {nextLesson.community_name}
              </p>

              <div className="flex items-center gap-4 text-sm text-white/80 mb-5">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  {formatLessonDate(nextLesson.scheduled_at)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  {nextLesson.duration_minutes} min
                </span>
              </div>

              <div className="flex gap-3">
                {nextLesson.daily_room_name && canJoinVideo(nextLesson) ? (
                  <Button
                    asChild
                    className="bg-white text-primary hover:bg-white/90 font-medium"
                  >
                    <Link href={`/video-session/${nextLesson.id}`} className="flex items-center gap-2">
                      <Video className="h-4 w-4" />
                      Join Video
                    </Link>
                  </Button>
                ) : (
                  <Button
                    disabled
                    className="bg-white/20 text-white border-0 font-medium"
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    Opens soon
                  </Button>
                )}
                <Button
                  variant="ghost"
                  asChild
                  className="text-white/90 hover:text-white hover:bg-white/10"
                >
                  <Link href={`/${nextLesson.community_slug}/private-lessons`}>
                    View Details
                  </Link>
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border-2 border-dashed border-border/60 p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Calendar className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="font-display text-lg font-semibold text-foreground mb-1">
              No upcoming lessons
            </h2>
            <p className="text-muted-foreground text-sm mb-4">
              Browse your communities to book a private lesson
            </p>
          </section>
        )}

        {/* Communities Pills */}
        {communities && communities.length > 0 && (
          <section>
            <h3 className="font-display text-lg font-semibold text-foreground mb-3">
              Your Communities
            </h3>
            <div className="flex flex-wrap gap-2">
              {communities.map((community) => (
                <Link
                  key={community.id}
                  href={`/${community.slug}`}
                  className={cn(
                    "inline-flex items-center gap-2 px-4 py-2.5 rounded-full",
                    "bg-card border border-border/50 shadow-sm",
                    "text-sm font-medium text-foreground",
                    "transition-all duration-200 ease-out",
                    "hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5",
                    "focus:outline-none focus:ring-2 focus:ring-primary/50"
                  )}
                >
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="h-3.5 w-3.5 text-primary" />
                  </div>
                  {community.name}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Upcoming Lessons List */}
        {upcomingLessons.length > 1 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg font-semibold text-foreground">
                Upcoming Lessons
              </h3>
              <Badge variant="secondary" className="font-normal">
                {upcomingLessons.length} scheduled
              </Badge>
            </div>

            <div className="bg-card rounded-2xl border border-border/50 shadow-sm divide-y divide-border/50 overflow-hidden">
              {upcomingLessons.slice(1).map((booking, index) => (
                <div
                  key={booking.id}
                  className={cn(
                    "flex items-center justify-between p-4",
                    "transition-colors duration-200",
                    "hover:bg-muted/30"
                  )}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="hidden sm:flex h-10 w-10 rounded-xl bg-primary/10 items-center justify-center flex-shrink-0">
                      <Video className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {booking.lesson_title}
                      </p>
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <span>{formatLessonDate(booking.scheduled_at)}</span>
                        <span className="text-border">·</span>
                        <span>{booking.community_name}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    {booking.daily_room_name && canJoinVideo(booking) ? (
                      <Button size="sm" asChild className="rounded-xl">
                        <Link href={`/video-session/${booking.id}`}>
                          Join
                        </Link>
                      </Button>
                    ) : (
                      <Badge variant="secondary" className="font-normal">
                        <Clock className="h-3 w-3 mr-1" />
                        Soon
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Past/Completed Lessons Summary */}
        {bookings.some(b => b.lesson_status === 'completed') && (
          <section>
            <h3 className="font-display text-lg font-semibold text-foreground mb-3">
              Recent Activity
            </h3>
            <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    {bookings.filter(b => b.lesson_status === 'completed').length} lessons completed
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Keep up the great work!
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Empty state when no communities */}
        {(!communities || communities.length === 0) && !error && (
          <section className="rounded-2xl border-2 border-dashed border-border/60 p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="font-display text-lg font-semibold text-foreground mb-1">
              Join a community
            </h2>
            <p className="text-muted-foreground text-sm">
              Discover dance communities and start your journey
            </p>
          </section>
        )}

        {/* Error state */}
        {error && (
          <section className="rounded-2xl bg-destructive/10 border border-destructive/20 p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <p className="text-sm text-destructive">
                Unable to load your communities. Please try again.
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
