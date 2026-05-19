"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatInTz } from "@/lib/timezone";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { ClockIcon, UsersIcon, VideoCameraIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "react-hot-toast";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import { LessonBookingWithDetails } from "@/types/private-lessons";

const LiveKitClassRoom = dynamic(() => import("./LiveKitClassRoom"), { ssr: false });

interface VideoToken {
  token: string;
  serverUrl: string;
}

type BookingWithRole = LessonBookingWithDetails & { is_teacher?: boolean };

function formatTimeUntil(totalMinutes: number): string {
  if (totalMinutes < 60) {
    return `${totalMinutes} ${totalMinutes === 1 ? "minute" : "minutes"}`;
  }
  if (totalMinutes < 24 * 60) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const hourPart = `${hours} ${hours === 1 ? "hour" : "hours"}`;
    if (mins === 0) return hourPart;
    return `${hourPart} ${mins} ${mins === 1 ? "minute" : "minutes"}`;
  }
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const dayPart = `${days} ${days === 1 ? "day" : "days"}`;
  if (hours === 0) return dayPart;
  return `${dayPart} ${hours} ${hours === 1 ? "hour" : "hours"}`;
}

export default function VideoSessionPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const userTimezone = useUserTimezone();
  const bookingId = params?.bookingId as string;

  const [booking, setBooking] = useState<BookingWithRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [videoToken, setVideoToken] = useState<VideoToken | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user && bookingId) fetchBookingData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, bookingId]);

  const fetchBookingData = async () => {
    try {
      const response = await fetch(`/api/bookings/${bookingId}`);
      if (!response.ok) {
        toast.error(response.status === 404 ? "Booking not found" : "Failed to load booking");
        router.push("/dashboard");
        return;
      }
      const data = await response.json();
      setBooking(data);
    } catch (e) {
      toast.error("Failed to load booking data");
    } finally {
      setIsLoading(false);
    }
  };

  // Derived state — mirrors the teacher-side modal and student dashboard logic.
  const now = new Date();
  const scheduledTime = booking?.scheduled_at ? new Date(booking.scheduled_at) : null;
  const lessonDuration = booking?.duration_minutes ?? 60;
  const endTime = scheduledTime
    ? new Date(scheduledTime.getTime() + lessonDuration * 60_000)
    : null;
  const isTeacher = !!booking?.is_teacher;
  const isCanceled = booking?.lesson_status === "canceled";
  const isCompleted = booking?.lesson_status === "completed";
  const isEnded =
    !isCanceled &&
    !isCompleted &&
    !!endTime &&
    now.getTime() > endTime.getTime() + 15 * 60_000;
  const isWithinJoinWindow =
    !scheduledTime || now.getTime() >= scheduledTime.getTime() - 15 * 60_000;
  const isStartingSoon =
    !!scheduledTime &&
    now.getTime() < scheduledTime.getTime() &&
    isWithinJoinWindow;
  const isLiveNow =
    !!scheduledTime && !!endTime && now >= scheduledTime && now <= endTime;
  const canJoin =
    booking?.payment_status === "succeeded" &&
    !isCanceled &&
    !isCompleted &&
    !isEnded &&
    isWithinJoinWindow;

  const handleJoinClick = async () => {
    if (!booking) return;
    setIsJoining(true);
    setError("");
    try {
      const response = await fetch(`/api/bookings/${bookingId}/video-token`, {
        method: "POST",
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to get video access");
      }
      const data = await response.json();
      setVideoToken({ token: data.token, serverUrl: data.serverUrl });
      setHasJoined(true);

      // Fire-and-forget session-start tracking.
      fetch("/api/video-session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          userRole: isTeacher ? "teacher" : "student",
        }),
      }).catch(() => {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to join";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeave = () => {
    if (booking) {
      fetch("/api/video-session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      }).catch(() => {});
    }
    router.push("/dashboard");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Booking not found</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-gray-600 mb-4">
              The lesson booking could not be found or you don't have access to it.
            </p>
            <Button onClick={() => router.push("/dashboard")} className="w-full">
              Back to dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Joined: full-screen LiveKit room, identical UX to live classes.
  if (hasJoined && videoToken) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-gray-900">
        <div className="h-screen">
          <LiveKitClassRoom
            token={videoToken.token}
            serverUrl={videoToken.serverUrl}
            onLeave={handleLeave}
            classTitle={booking.lesson_title}
            isTeacher={isTeacher}
            autoEnableMedia
          />
        </div>
      </div>
    );
  }

  // Status displays for non-joinable states.
  if (isCanceled || isCompleted || isEnded || !canJoin) {
    let badge: { label: string; variant?: "secondary" | "outline" } = {
      label: "Scheduled",
      variant: "outline",
    };
    let heading = "";
    let body = "";

    if (isCanceled) {
      badge = { label: "Canceled", variant: "secondary" };
      heading = "This lesson has been canceled";
      body = "Please contact your teacher to reschedule.";
    } else if (isCompleted) {
      badge = { label: "Completed", variant: "secondary" };
      heading = "This lesson has been completed";
      body = "Thanks for joining. Check your dashboard for upcoming lessons.";
    } else if (isEnded) {
      badge = { label: "Ended", variant: "secondary" };
      heading = "This lesson has ended";
      body = "The scheduled window has passed.";
    } else if (booking.payment_status !== "succeeded") {
      badge = { label: "Pending Payment", variant: "secondary" };
      heading = "Payment required";
      body = "Payment must be completed before joining the lesson.";
    } else if (scheduledTime) {
      const minutesUntilStart = Math.max(
        0,
        Math.ceil((scheduledTime.getTime() - now.getTime()) / 60_000)
      );
      heading =
        minutesUntilStart > 0
          ? `Lesson starts in ${formatTimeUntil(minutesUntilStart)}`
          : "Lesson starting soon";
      body = "You'll be able to join 15 minutes before the lesson begins.";
    }

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-center">{booking.lesson_title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Badge variant={badge.variant} className="mb-4">
                  {badge.label}
                </Badge>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {heading}
                </h3>
                <p className="text-gray-600 mb-6">{body}</p>
                <Button onClick={() => router.push("/dashboard")} variant="outline">
                  Back to dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Pre-join lobby (live-class style).
  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-900">
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center mb-4">
              {isLiveNow ? (
                <Badge variant="destructive" className="bg-red-500">
                  LIVE NOW
                </Badge>
              ) : isStartingSoon ? (
                <Badge variant="secondary" className="bg-yellow-500 text-white">
                  Starting Soon
                </Badge>
              ) : (
                <Badge variant="outline">Ready to Join</Badge>
              )}
            </div>

            <CardTitle className="text-xl sm:text-2xl mb-2">
              {booking.lesson_title}
            </CardTitle>

            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-gray-600">
              {scheduledTime && endTime && (
                <div className="flex items-center">
                  <ClockIcon className="h-4 w-4 mr-1" />
                  {formatInTz(scheduledTime, userTimezone, "h:mm a")} - {formatInTz(endTime, userTimezone, "h:mm a")}
                </div>
              )}
              <div className="flex items-center">
                <UsersIcon className="h-4 w-4 mr-1" />
                {lessonDuration} minutes
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {booking.lesson_description && (
              <div>
                <h3 className="font-medium text-gray-900 mb-2">About this lesson</h3>
                <p className="text-gray-600">{booking.lesson_description}</p>
              </div>
            )}

            <div>
              <h3 className="font-medium text-gray-900 mb-2">Community</h3>
              <p className="text-gray-600">{booking.community_name}</p>
            </div>

            {booking.student_message && !isTeacher && (
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Your message</h3>
                <p className="text-gray-600">{booking.student_message}</p>
              </div>
            )}

            {booking.student_message && isTeacher && (
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Message from student</h3>
                <p className="text-gray-600">{booking.student_message}</p>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="flex justify-center pt-4">
              <Button
                onClick={handleJoinClick}
                disabled={isJoining}
                size="lg"
                className="flex items-center space-x-2"
              >
                <VideoCameraIcon className="h-5 w-5" />
                <span>{isJoining ? "Joining..." : "Join Lesson"}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
