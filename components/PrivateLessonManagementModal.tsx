"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import TeacherCalendarAvailability from './TeacherCalendarAvailability';
import CreatePrivateLessonModal from './CreatePrivateLessonModal';
import { Loader2, Edit, BookOpen, Users, Calendar, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface PrivateLessonManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  communityId: string;
  communitySlug: string;
  /** Fires after any mutation that changes the lesson set (delete, toggle).
   *  Parent should use this to re-sync its own list (fetchLessons +
   *  router.refresh) so the page grid reflects the change. */
  onLessonsChanged?: () => void;
}

type TabType = 'details' | 'schedule';

export default function PrivateLessonManagementModal({
  isOpen,
  onClose,
  communityId,
  communitySlug,
  onLessonsChanged,
}: PrivateLessonManagementModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('details');
  const { user, session } = useAuth();

  // Private lessons state
  const [privateLessons, setPrivateLessons] = useState<any[]>([]);
  const [isLoadingLessons, setIsLoadingLessons] = useState(false);

  // Lesson bookings state
  const [lessonBookings, setLessonBookings] = useState<any[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);

  // Teacher availability state
  const [teacherAvailability, setTeacherAvailability] = useState<{date: string, slots: any[]}[]>([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);

  // Edit modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<any>(null);

  // Delete confirmation state — replaces the native confirm() dialog so the
  // delete prompt matches the AlertDialog used elsewhere in the app.
  const [lessonToDelete, setLessonToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Utility functions
  // Match PrivateLessonCard / LessonBookingModal: prices are stored as
  // dollars in DECIMAL(10,2), formatted as EUR currency without dividing.
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
    }).format(price);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Fetch private lessons
  useEffect(() => {
    async function fetchPrivateLessons() {
      if (isOpen) {
        setIsLoadingLessons(true);
        try {
          const response = await fetch(`/api/community/${communitySlug}/private-lessons?include_inactive=true`);
          if (!response.ok) throw new Error("Failed to fetch private lessons");
          const data = await response.json();
          setPrivateLessons(data.lessons || []);
        } catch (error) {
          console.error("Error fetching private lessons:", error);
          toast.error("Failed to load private lessons");
        } finally {
          setIsLoadingLessons(false);
        }
      }
    }

    fetchPrivateLessons();
  }, [communitySlug, isOpen]);

  // Fetch lesson bookings
  useEffect(() => {
    async function fetchLessonBookings() {
      if (isOpen) {
        setIsLoadingBookings(true);
        try {
          if (!session) {
            console.error('No active session');
            return;
          }

          const response = await fetch(`/api/community/${communitySlug}/lesson-bookings`);

          if (!response.ok) {
            throw new Error(`Failed to fetch lesson bookings: ${response.status}`);
          }

          const data = await response.json();
          setLessonBookings(data.bookings || []);
        } catch (error) {
          console.error("Error fetching lesson bookings:", error);
          toast.error("Failed to load lesson bookings");
        } finally {
          setIsLoadingBookings(false);
        }
      }
    }

    fetchLessonBookings();
  }, [communitySlug, isOpen, session]);

  // Handle lesson status toggle
  const handleToggleLessonStatus = async (lessonId: string, currentStatus: boolean) => {
    try {
      if (!session) {
        throw new Error('Authentication required');
      }

      // PATCH on /[lessonId] only updates is_active (the dedicated toggle
      // endpoint at /toggle was a leftover URL that was never implemented).
      const response = await fetch(`/api/community/${communitySlug}/private-lessons/${lessonId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_active: !currentStatus }),
      });

      if (!response.ok) throw new Error('Failed to update lesson status');

      // Update local state
      setPrivateLessons(prev => prev.map(lesson => 
        lesson.id === lessonId 
          ? { ...lesson, is_active: !currentStatus }
          : lesson
      ));
      
      toast.success(`Lesson ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
      onLessonsChanged?.();
    } catch (error) {
      console.error('Error toggling lesson status:', error);
      toast.error('Failed to update lesson status');
    }
  };

  // Confirmed lesson deletion (called from the AlertDialog).
  const confirmDeleteLesson = async () => {
    if (!lessonToDelete) return;
    const lessonId = lessonToDelete.id;
    setIsDeleting(true);
    try {
      if (!session) {
        throw new Error('Authentication required');
      }

      const response = await fetch(`/api/community/${communitySlug}/private-lessons/${lessonId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete lesson');

      // Remove from local state
      setPrivateLessons(prev => prev.filter(lesson => lesson.id !== lessonId));
      toast.success('Private lesson deleted successfully');
      setLessonToDelete(null);
      onLessonsChanged?.();
    } catch (error) {
      console.error('Error deleting lesson:', error);
      toast.error('Failed to delete lesson');
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle video session join
  const handleJoinVideoSession = async (booking: any) => {
    try {
      if (!session) {
        throw new Error('Authentication required');
      }

      const response = await fetch(`/api/bookings/${booking.id}/video-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) throw new Error('Failed to get video token');

      const { token, room_url } = await response.json();
      window.open(`/video-session/${booking.id}?token=${token}`, '_blank');
    } catch (error) {
      console.error('Error joining video session:', error);
      toast.error('Failed to join video session');
    }
  };

  // Handle edit lesson
  const handleEditLesson = (lesson: any) => {
    setEditingLesson(lesson);
    setIsEditModalOpen(true);
  };

  // Handle edit success
  const handleEditSuccess = () => {
    // Refetch private lessons to update the list
    const refetchLessons = async () => {
      setIsLoadingLessons(true);
      try {
        const response = await fetch(`/api/community/${communitySlug}/private-lessons?include_inactive=true`);
        if (!response.ok) throw new Error("Failed to fetch private lessons");
        const data = await response.json();
        setPrivateLessons(data.lessons || []);
      } catch (error) {
        console.error("Error fetching private lessons:", error);
        toast.error("Failed to refresh lessons");
      } finally {
        setIsLoadingLessons(false);
      }
    };
    
    refetchLessons();
    setIsEditModalOpen(false);
    setEditingLesson(null);
    onLessonsChanged?.();
  };

  const renderDetailsTab = () => (
    <div className="space-y-6">
      {/* Header with stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-2xl p-5 border border-border/50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-muted-foreground">Total Lessons</h3>
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <BookOpen className="h-4 w-4 text-primary" />
            </div>
          </div>
          <p className="font-display text-3xl font-bold text-foreground">{Array.isArray(privateLessons) ? privateLessons.length : 0}</p>
        </div>

        <div className="bg-card rounded-2xl p-5 border border-border/50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-muted-foreground">Active Lessons</h3>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <BookOpen className="h-4 w-4 text-emerald-500" />
            </div>
          </div>
          <p className="font-display text-3xl font-bold text-foreground">
            {(Array.isArray(privateLessons) ? privateLessons.filter(lesson => lesson.is_active) : []).length}
          </p>
        </div>

        <div className="bg-card rounded-2xl p-5 border border-border/50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-muted-foreground">Total Bookings</h3>
            <div className="w-8 h-8 rounded-lg bg-secondary/30 flex items-center justify-center">
              <Users className="h-4 w-4 text-secondary-foreground" />
            </div>
          </div>
          <p className="font-display text-3xl font-bold text-foreground">{Array.isArray(lessonBookings) ? lessonBookings.length : 0}</p>
        </div>
      </div>

      {/* Private Lessons List */}
      <div>
        <div className="mb-4">
          <h3 className="font-display text-lg font-semibold text-foreground">Your Private Lessons</h3>
        </div>

        {isLoadingLessons ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">Loading lessons...</p>
          </div>
        ) : !Array.isArray(privateLessons) || privateLessons.length === 0 ? (
          <div className="text-center py-12 bg-muted/30 rounded-2xl border border-border/50">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-display font-semibold text-foreground">No private lessons</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Go to the Private Lessons page to create your first lesson.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Array.isArray(privateLessons) ? privateLessons.map((lesson) => (
              <div key={lesson.id} className="bg-card rounded-2xl p-6 border border-border/50 hover:border-primary/20 transition-all duration-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-display font-semibold text-lg text-foreground">{lesson.title}</h4>
                      <Badge
                        className={cn(
                          "rounded-full",
                          lesson.is_active
                            ? "bg-emerald-100 text-emerald-700 border-0"
                            : "bg-muted text-muted-foreground border-0"
                        )}
                      >
                        {lesson.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>

                    <p className="text-muted-foreground mb-4">{lesson.description}</p>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Duration:</span>
                        <p className="font-medium text-foreground">{lesson.duration_minutes} min</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Regular Price:</span>
                        <p className="font-medium text-foreground">{formatPrice(lesson.regular_price)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Member Price:</span>
                        <p className="font-medium text-foreground">
                          {lesson.member_price ? formatPrice(lesson.member_price) : 'Same as regular'}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Location:</span>
                        <p className="font-medium text-foreground capitalize">{lesson.location_type.replace('_', ' ')}</p>
                      </div>
                    </div>

                    {lesson.requirements && (
                      <div className="mt-4 p-3 bg-primary/5 rounded-xl border border-primary/10">
                        <p className="text-sm text-foreground">
                          <strong>Requirements:</strong> {lesson.requirements}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditLesson(lesson)}
                      className="rounded-lg border-border/50 hover:bg-muted"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleLessonStatus(lesson.id, lesson.is_active)}
                      className="rounded-lg border-border/50 hover:bg-muted"
                    >
                      {lesson.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setLessonToDelete(lesson)}
                      className="rounded-lg"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            )) : []}
          </div>
        )}
      </div>

      {/* Lesson Bookings */}
      <div>
        <h3 className="font-display text-lg font-semibold text-foreground mb-4">Lesson Bookings & Sessions</h3>

        {isLoadingBookings ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">Loading bookings...</p>
          </div>
        ) : !Array.isArray(lessonBookings) || lessonBookings.length === 0 ? (
          <div className="text-center py-12 bg-muted/30 rounded-2xl border border-border/50">
            <div className="w-12 h-12 rounded-2xl bg-secondary/20 flex items-center justify-center mx-auto mb-3">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-display font-semibold text-foreground">No bookings yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Bookings will appear here when students book your private lessons.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Array.isArray(lessonBookings) ? lessonBookings.map((booking) => (
              <div key={booking.id} className="bg-card rounded-2xl p-6 border border-border/50 hover:border-primary/20 transition-all duration-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h4 className="font-display font-semibold text-lg text-foreground">{booking.lesson_title}</h4>
                      <Badge
                        className={cn(
                          "rounded-full border-0",
                          booking.payment_status === 'succeeded'
                            ? "bg-emerald-100 text-emerald-700"
                            : booking.payment_status === 'pending'
                              ? "bg-amber-100 text-amber-700"
                              : "bg-destructive/10 text-destructive"
                        )}
                      >
                        {booking.payment_status}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                      <div>
                        <span className="text-muted-foreground">Student:</span>
                        <p className="font-medium text-foreground">{booking.student_name || booking.student_email}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Price Paid:</span>
                        <p className="font-medium text-foreground">{formatPrice(booking.price_paid)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Booked:</span>
                        <p className="font-medium text-foreground">{formatDate(booking.created_at)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Scheduled:</span>
                        <p className="font-medium text-foreground">{booking.scheduled_at ? formatDateTime(booking.scheduled_at) : 'TBD'}</p>
                      </div>
                    </div>

                    {booking.student_message && (
                      <div className="mt-3 p-3 bg-muted/50 rounded-xl">
                        <p className="text-sm text-foreground">
                          <strong>Student Message:</strong> {booking.student_message}
                        </p>
                      </div>
                    )}

                    {booking.contact_info && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        {booking.contact_info.phone && (
                          <p><strong className="text-foreground">Phone:</strong> {booking.contact_info.phone}</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 ml-4">
                    {booking.payment_status === 'succeeded' && booking.scheduled_at && (
                      <Button
                        onClick={() => handleJoinVideoSession(booking)}
                        className="rounded-lg bg-emerald-500 hover:bg-emerald-600"
                        size="sm"
                      >
                        Join Video Session
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (booking.student_email) {
                          window.location.href = `mailto:${booking.student_email}`;
                        }
                      }}
                      className="rounded-lg border-border/50 hover:bg-muted"
                    >
                      Contact Student
                    </Button>
                  </div>
                </div>
              </div>
            )) : []}
          </div>
        )}
      </div>
    </div>
  );

  const renderScheduleTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-lg font-semibold text-foreground mb-4">Teacher Availability</h3>
        <div className="bg-card rounded-2xl border border-border/50 p-4">
          <TeacherCalendarAvailability
            communitySlug={communitySlug}
            availability={teacherAvailability}
            onAvailabilityUpdate={setTeacherAvailability}
          />
        </div>
      </div>
    </div>
  );

  return (
    <Transition appear show={isOpen} as={React.Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={React.Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-6xl transform overflow-hidden rounded-3xl bg-background p-6 text-left align-middle shadow-xl transition-all border border-border/50">
                <div className="flex items-center justify-between mb-6">
                  <Dialog.Title
                    as="h3"
                    className="font-display text-xl font-semibold text-foreground"
                  >
                    Manage Private Lessons
                  </Dialog.Title>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="rounded-full h-10 w-10 p-0 hover:bg-muted"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>

                {/* Tabs Navigation */}
                <div className="flex gap-2 mb-6">
                  <button
                    onClick={() => setActiveTab('details')}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-200",
                      activeTab === 'details'
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    <BookOpen className="w-4 h-4" />
                    Details
                  </button>
                  <button
                    onClick={() => setActiveTab('schedule')}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-200",
                      activeTab === 'schedule'
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    <Calendar className="w-4 h-4" />
                    Schedule
                  </button>
                </div>

                {/* Tab Content */}
                <div className="max-h-[600px] overflow-y-auto pr-2">
                  {activeTab === 'details' && renderDetailsTab()}
                  {activeTab === 'schedule' && renderScheduleTab()}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
      
      {/* Edit Private Lesson Modal */}
      <CreatePrivateLessonModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingLesson(null);
        }}
        communitySlug={communitySlug}
        onSuccess={handleEditSuccess}
        editingLesson={editingLesson}
      />

      {/* Delete confirmation — same shape as the calendar delete dialog. */}
      <AlertDialog
        open={!!lessonToDelete}
        onOpenChange={(open) => { if (!open) setLessonToDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this private lesson?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{lessonToDelete?.title}&rdquo; will be removed and members
              won&apos;t be able to book it anymore. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteLesson}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Transition>
  );
}