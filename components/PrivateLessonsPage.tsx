"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { PrivateLesson } from "@/types/private-lessons";
import PrivateLessonCard from "./PrivateLessonCard";
import LessonBookingModal from "./LessonBookingModal";
import CreatePrivateLessonModal from "./CreatePrivateLessonModal";
import PrivateLessonManagementModal from "./PrivateLessonManagementModal";
import { Button } from "@/components/ui/button";
import { Plus, BookOpen, Settings, Users, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";

interface PrivateLessonsPageProps {
  communitySlug: string;
  communityId: string;
  isCreator: boolean;
  isMember: boolean;
  /** Server-fetched lessons — skips the first client fetch + spinner. */
  initialLessons?: PrivateLesson[];
}

export default function PrivateLessonsPage({
  communitySlug,
  communityId,
  isCreator,
  isMember,
  initialLessons,
}: PrivateLessonsPageProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [lessons, setLessons] = useState<PrivateLesson[]>(initialLessons ?? []);
  const [isLoading, setIsLoading] = useState(!initialLessons);
  const [selectedLesson, setSelectedLesson] = useState<PrivateLesson | null>(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isManagementModalOpen, setIsManagementModalOpen] = useState(false);
  const skipInitialFetch = useRef(!!initialLessons);

  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    fetchLessons();
  }, [communitySlug]);

  const fetchLessons = async () => {
    try {
      // Owners get inactive lessons too so they stay in the grid (with the
      // 'Hidden' badge) after a deactivate/edit-toggle in the management
      // modal — same as the server-side initialLessons behavior.
      const url = isCreator
        ? `/api/community/${communitySlug}/private-lessons?include_inactive=true`
        : `/api/community/${communitySlug}/private-lessons`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch lessons');
      }
      const data = await response.json();
      setLessons(data.lessons || []);
    } catch (error) {
      console.error('Error fetching lessons:', error);
      toast.error('Failed to load private lessons');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBookLesson = (lessonId: string) => {
    const lesson = lessons.find(l => l.id === lessonId);
    if (lesson) {
      setSelectedLesson(lesson);
      setIsBookingModalOpen(true);
    }
  };

  const handleBookingSuccess = () => {
    toast.success('Booking successful! The teacher will contact you soon.');
    // Optionally refresh lessons or update UI
  };

  const handleCreateSuccess = () => {
    fetchLessons(); // Refresh the lessons list locally
    // Purge the Next.js Router Cache so nav-away-and-back shows the new
    // lesson from the server-fetched initialLessons.
    router.refresh();
  };

  // Mutations from inside the management modal (delete, toggle, edit) need
  // to bubble back here so the page grid + RSC cache also re-sync.
  const handleManagementMutation = () => {
    fetchLessons();
    router.refresh();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center animate-pulse">
          <Users className="w-6 h-6 text-primary" />
        </div>
        <p className="mt-4 text-muted-foreground font-medium">Loading lessons...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-foreground">
            Private Lessons
          </h1>
          <p className="text-muted-foreground mt-2">
            Book one-on-one sessions with the instructor
          </p>
        </div>
        {isCreator && (
          <div className="flex gap-2 flex-shrink-0">
            <Button
              id="manage-private-lessons"
              variant="outline"
              onClick={() => setIsManagementModalOpen(true)}
              className="rounded-xl border-border/50 hover:bg-muted hover:border-primary/30 transition-all duration-200"
            >
              <Settings className="w-4 h-4 mr-2" />
              Manage Lessons
            </Button>
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="rounded-xl bg-primary hover:bg-primary/90 transition-all duration-200"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Private Lesson
            </Button>
          </div>
        )}
      </div>

      {/* Member discount notice */}
      {!isMember && lessons.some(lesson => lesson.member_price) && (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-foreground">
                Get Member Pricing
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Join this community to unlock exclusive member discounts on private lessons.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Lessons Grid */}
      {lessons.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border/50 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <h3 className="font-display text-xl font-semibold text-foreground mb-2">
            No Private Lessons Available
          </h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            {isCreator
              ? "Create your first private lesson to start offering one-on-one sessions."
              : "The instructor hasn't added any private lessons yet. Check back later!"
            }
          </p>
          {isCreator && (
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="rounded-xl bg-primary hover:bg-primary/90"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Private Lesson
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {lessons.map((lesson) => (
            <PrivateLessonCard
              key={lesson.id}
              lesson={lesson}
              communitySlug={communitySlug}
              isMember={isMember}
              onBook={handleBookLesson}
            />
          ))}
        </div>
      )}

      {/* Booking Modal */}
      {selectedLesson && (
        <LessonBookingModal
          isOpen={isBookingModalOpen}
          onClose={() => {
            setIsBookingModalOpen(false);
            setSelectedLesson(null);
          }}
          lesson={selectedLesson}
          communitySlug={communitySlug}
          isMember={isMember}
          onSuccess={handleBookingSuccess}
        />
      )}

      {/* Create Lesson Modal */}
      <CreatePrivateLessonModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        communitySlug={communitySlug}
        onSuccess={handleCreateSuccess}
      />

      {/* Management Modal */}
      {isCreator && (
        <PrivateLessonManagementModal
          isOpen={isManagementModalOpen}
          onClose={() => setIsManagementModalOpen(false)}
          communityId={communityId}
          communitySlug={communitySlug}
          onLessonsChanged={handleManagementMutation}
        />
      )}
    </div>
  );
} 