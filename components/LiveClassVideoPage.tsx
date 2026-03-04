"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ClockIcon, UsersIcon, VideoCameraIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import CustomDailyRoom from "./CustomDailyRoom";
import { toast } from "react-hot-toast";

interface LiveClass {
  id: string;
  title: string;
  description?: string;
  scheduled_start_time: string;
  duration_minutes: number;
  teacher_name: string;
  teacher_avatar_url?: string;
  community_name: string;
  community_slug: string;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  is_currently_active: boolean;
  is_starting_soon: boolean;
}

interface LiveClassVideoPageProps {
  classId: string;
  liveClass: LiveClass;
}

interface VideoToken {
  roomUrl: string;
  token: string;
  expires: number;
  isTeacher: boolean;
}

export default function LiveClassVideoPage({ classId, liveClass }: LiveClassVideoPageProps) {
  const router = useRouter();
  const [videoToken, setVideoToken] = useState<VideoToken | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasJoined, setHasJoined] = useState(false);

  const startTime = typeof liveClass.scheduled_start_time === 'string'
    ? parseISO(liveClass.scheduled_start_time)
    : new Date(liveClass.scheduled_start_time);
  const endTime = new Date(startTime.getTime() + liveClass.duration_minutes * 60000);
  const now = new Date();

  const canJoin = liveClass.is_currently_active || liveClass.is_starting_soon;
  const hasEnded = liveClass.status === 'ended' || now > endTime;
  const isCancelled = liveClass.status === 'cancelled';

  const fetchVideoToken = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`/api/live-classes/${classId}/video-token`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get video access");
      }

      const tokenData = await response.json();
      setVideoToken(tokenData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to join video session";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinClick = () => {
    setHasJoined(true);
    fetchVideoToken();
  };

  const handleLeave = () => {
    // Redirect to community page when user leaves the call
    router.push(`/${liveClass.community_slug}`);
  };

  const getStatusDisplay = () => {
    if (isCancelled) {
      return (
        <div className="text-center py-12">
          <Badge variant="secondary" className="mb-4">Cancelled</Badge>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            This live class has been cancelled
          </h3>
          <p className="text-gray-600">
            Please check the calendar for rescheduled classes or contact the teacher.
          </p>
        </div>
      );
    }

    if (hasEnded) {
      return (
        <div className="text-center py-12">
          <Badge variant="secondary" className="mb-4">Ended</Badge>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            This live class has ended
          </h3>
          <p className="text-gray-600">
            Thank you for participating! Check the calendar for upcoming classes.
          </p>
        </div>
      );
    }

    if (!canJoin) {
      const timeUntilStart = startTime.getTime() - now.getTime();
      const minutesUntilStart = Math.ceil(timeUntilStart / (1000 * 60));

      return (
        <div className="text-center py-12">
          <Badge variant="outline" className="mb-4">Scheduled</Badge>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Class starts in {minutesUntilStart} minutes
          </h3>
          <p className="text-gray-600 mb-6">
            You'll be able to join 15 minutes before the class begins.
          </p>
          <Button disabled className="flex items-center space-x-2">
            <VideoCameraIcon className="h-4 w-4" />
            <span>Join Class</span>
          </Button>
        </div>
      );
    }

    return null;
  };

  const statusDisplay = getStatusDisplay();

  if (statusDisplay) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-center">{liveClass.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {statusDisplay}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {!hasJoined || !videoToken ? (
        // Pre-join lobby
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader className="text-center">
              <div className="flex items-center justify-center mb-4">
                {liveClass.is_currently_active ? (
                  <Badge variant="destructive" className="bg-red-500">
                    LIVE NOW
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-yellow-500 text-white">
                    Starting Soon
                  </Badge>
                )}
              </div>
              
              <CardTitle className="text-2xl mb-2">{liveClass.title}</CardTitle>
              
              <div className="flex items-center justify-center space-x-6 text-sm text-gray-600">
                <div className="flex items-center">
                  <ClockIcon className="h-4 w-4 mr-1" />
                  {format(startTime, 'h:mm a')} - {format(endTime, 'h:mm a')}
                </div>
                <div className="flex items-center">
                  <UsersIcon className="h-4 w-4 mr-1" />
                  {liveClass.duration_minutes} minutes
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-6">
              {liveClass.description && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">About this class</h3>
                  <p className="text-gray-600">{liveClass.description}</p>
                </div>
              )}
              
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Instructor</h3>
                <div className="flex items-center">
                  {liveClass.teacher_avatar_url && (
                    <img
                      src={liveClass.teacher_avatar_url}
                      alt={liveClass.teacher_name}
                      className="h-10 w-10 rounded-full mr-3"
                    />
                  )}
                  <span className="text-gray-900">{liveClass.teacher_name}</span>
                </div>
              </div>

              <div>
                <h3 className="font-medium text-gray-900 mb-2">Community</h3>
                <p className="text-gray-600">{liveClass.community_name}</p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="flex justify-center pt-4">
                <Button
                  onClick={handleJoinClick}
                  disabled={loading}
                  size="lg"
                  className="flex items-center space-x-2"
                >
                  <VideoCameraIcon className="h-5 w-5" />
                  <span>
                    {loading ? "Joining..." : "Join Live Class"}
                  </span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        // Video session
        <div className="h-screen">
          <CustomDailyRoom
            roomUrl={videoToken.roomUrl}
            token={videoToken.token}
            onLeave={handleLeave}
            classTitle={liveClass.title}
            isTeacher={videoToken.isTeacher}
          />
        </div>
      )}
    </div>
  );
}