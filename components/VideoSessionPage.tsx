"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { LessonBookingWithDetails } from "@/types/private-lessons";
import dynamic from "next/dynamic";
const LiveKitVideoCall = dynamic(() => import("@/components/LiveKitVideoCall"), { ssr: false });
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Clock, 
  User, 
  Calendar, 
  MapPin, 
  MessageSquare, 
  AlertCircle,
  CheckCircle,
  Video,
  ArrowLeft
} from "lucide-react";
import { toast } from "react-hot-toast";
import { format } from "date-fns";

// Component to handle token fetching and video call rendering
function VideoCallWithTokens({ 
  booking, 
  bookingId, 
  isTeacher, 
  onCallStart, 
  onCallEnd 
}: {
  booking: LessonBookingWithDetails;
  bookingId: string;
  isTeacher: boolean;
  onCallStart: () => void;
  onCallEnd: () => void;
}) {
  const [videoData, setVideoData] = useState<{
    token: string;
    serverUrl: string;
  } | null>(null);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);

  useEffect(() => {
    fetchVideoTokens();
  }, [booking, isTeacher]);

  const fetchVideoTokens = async () => {
    setIsLoadingTokens(true);
    try {
      const response = await fetch(`/api/bookings/${bookingId}/video-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Internal server error');
      }

      const data = await response.json();
      setVideoData({
        token: data.token,
        serverUrl: data.serverUrl
      });

    } catch (error) {
      console.error('Error fetching video tokens:', error);
      toast.error('Failed to set up video session');
    } finally {
      setIsLoadingTokens(false);
    }
  };

  if (isLoadingTokens) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p>Setting up video session...</p>
        </CardContent>
      </Card>
    );
  }

  if (!videoData) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="text-center space-y-4">
          <Video className="w-16 h-16 text-gray-400 mx-auto" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Video Session Setup Required
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Unable to set up video session. Please refresh the page.
            </p>
            <Button onClick={fetchVideoTokens}>
              Retry Setup
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Log the video data for debugging
  console.log('📹 Video data:', {
    serverUrl: videoData.serverUrl,
    hasToken: !!videoData.token,
    tokenLength: videoData.token?.length
  });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden" style={{ height: '600px' }}>
      <LiveKitVideoCall
        token={videoData.token}
        serverUrl={videoData.serverUrl}
      />
    </div>
  );
}

export default function VideoSessionPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const bookingId = params?.bookingId as string;
  
  const [booking, setBooking] = useState<LessonBookingWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTeacher, setIsTeacher] = useState(false);
  const [canJoin, setCanJoin] = useState(false);
  const [timeUntilStart, setTimeUntilStart] = useState<string>('');

  useEffect(() => {
    if (user && bookingId) {
      fetchBookingData();
    }
  }, [user, bookingId]);

  useEffect(() => {
    // Update time until start every minute
    const interval = setInterval(() => {
      if (booking?.scheduled_at) {
        updateTimeUntilStart();
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [booking]);

  const fetchBookingData = async () => {
    try {
      // Fetch booking via API
      const response = await fetch(`/api/bookings/${bookingId}`);

      if (!response.ok) {
        if (response.status === 404) {
          toast.error('Booking not found');
        } else if (response.status === 403) {
          toast.error('You are not authorized to access this booking');
        } else {
          toast.error('Failed to load booking');
        }
        router.push('/dashboard');
        return;
      }

      const bookingData = await response.json();

      setIsTeacher(bookingData.is_teacher);
      setBooking({
        ...bookingData,
        // Map flattened fields to expected format
        lesson_title: bookingData.lesson_title,
        lesson_description: bookingData.lesson_description,
        duration_minutes: bookingData.duration_minutes,
        regular_price: bookingData.regular_price,
        member_price: bookingData.member_price,
        community_name: bookingData.community_name,
        community_slug: bookingData.community_slug,
      });

      // Check if we can join the call
      updateJoinStatus(bookingData);
      updateTimeUntilStart(bookingData);

    } catch (error) {
      console.error('Error fetching booking data:', error);
      toast.error('Failed to load booking data');
    } finally {
      setIsLoading(false);
    }
  };

  const updateJoinStatus = (bookingData?: any) => {
    const data = bookingData || booking;
    if (!data) return;

    const now = new Date();
    const scheduledTime = data.scheduled_at ? new Date(data.scheduled_at) : null;

    // Can join if:
    // 1. Payment is successful
    // 2. Has LiveKit room name (tokens can be generated on-demand)
    // 3. Within 15 minutes of scheduled time (or no scheduled time)
    const hasValidPayment = data.payment_status === 'succeeded';
    const hasRoomInfo = data.livekit_room_name;
    const isWithinJoinWindow = !scheduledTime ||
      (now.getTime() >= scheduledTime.getTime() - 15 * 60 * 1000); // 15 minutes before

    setCanJoin(hasValidPayment && hasRoomInfo && isWithinJoinWindow);
  };

  const updateTimeUntilStart = (bookingData?: any) => {
    const data = bookingData || booking;
    if (!data?.scheduled_at) return;

    const now = new Date();
    const scheduledTime = new Date(data.scheduled_at);
    const diffMs = scheduledTime.getTime() - now.getTime();

    if (diffMs <= 0) {
      setTimeUntilStart('Now');
    } else {
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) {
        setTimeUntilStart(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setTimeUntilStart(`${hours}h ${minutes}m`);
      } else {
        setTimeUntilStart(`${minutes}m`);
      }
    }
  };

  const handleCallStart = async () => {
    if (!booking) return;
    
    try {
      // Use VideoRoomService for proper session tracking
      const userRole = isTeacher ? 'teacher' : 'student';
      await fetch('/api/video-session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          bookingId: booking.id,
          userRole 
        }),
      });
    } catch (error) {
      console.error('Error starting video session:', error);
    }
  };

  const handleCallEnd = async () => {
    if (!booking) return;
    
    try {
      // Use VideoRoomService for proper session tracking
      await fetch('/api/video-session/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id }),
      });
      
      toast.success('Lesson completed!');
      router.push(`/${booking.community_slug}/private-lessons`);
    } catch (error) {
      console.error('Error ending video session:', error);
    }
  };

  const goBack = () => {
    if (booking) {
      router.push(`/${booking.community_slug}/private-lessons`);
    } else {
      router.push('/dashboard');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Booking Not Found
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              The lesson booking could not be found or you don't have access to it.
            </p>
            <Button onClick={goBack} className="w-full">
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={goBack} size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {booking.lesson_title}
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {booking.community_name}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isTeacher && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  Teacher
                </Badge>
              )}
              <Badge variant={booking.payment_status === 'succeeded' ? 'default' : 'secondary'}>
                {booking.payment_status}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Video Call Section */}
          <div className="lg:col-span-2">
            {canJoin && booking.livekit_room_name ? (
              <VideoCallWithTokens
                booking={booking}
                bookingId={bookingId}
                isTeacher={isTeacher}
                onCallStart={handleCallStart}
                onCallEnd={handleCallEnd}
              />
            ) : (
              <Card className="h-full flex items-center justify-center">
                <CardContent className="text-center space-y-4">
                  <Video className="w-16 h-16 text-gray-400 mx-auto" />
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      Video Session
                    </h3>
                    {booking.payment_status !== 'succeeded' ? (
                      <p className="text-gray-600 dark:text-gray-300">
                        Payment must be completed before joining the lesson.
                      </p>
                    ) : !booking.livekit_room_name ? (
                      <p className="text-gray-600 dark:text-gray-300">
                        Video room is being set up. Please refresh the page.
                      </p>
                    ) : (
                      <div>
                        <p className="text-gray-600 dark:text-gray-300 mb-2">
                          You can join the lesson {booking.scheduled_at ? '15 minutes before the scheduled time' : 'anytime'}.
                        </p>
                        {timeUntilStart && timeUntilStart !== 'Now' && (
                          <p className="text-sm text-blue-600 dark:text-blue-400">
                            Starts in: {timeUntilStart}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Lesson Details Sidebar */}
          <div className="space-y-6">
            {/* Lesson Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Lesson Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <span className="text-sm">{booking.duration_minutes} minutes</span>
                </div>
                
                <div className="flex items-center gap-3">
                  <MapPin className="w-4 h-4 text-gray-500" />
                  <span className="text-sm">Online Video Call</span>
                </div>

                {booking.scheduled_at && (
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <span className="text-sm">
                      {format(new Date(booking.scheduled_at), 'PPP p')}
                    </span>
                  </div>
                )}

                {booking.lesson_description && (
                  <div>
                    <h4 className="font-medium mb-2">Description</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {booking.lesson_description}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Messages */}
            {booking.student_message && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Student Message
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {booking.student_message}
                  </p>
                </CardContent>
              </Card>
            )}

            {booking.teacher_notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Teacher Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {booking.teacher_notes}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Technical Requirements */}
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Technical Requirements</AlertTitle>
              <AlertDescription className="text-sm">
                Make sure you have a stable internet connection, working camera, and microphone for the best lesson experience.
              </AlertDescription>
            </Alert>
          </div>
        </div>
      </div>
    </div>
  );
}
