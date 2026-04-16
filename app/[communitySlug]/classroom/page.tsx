"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";
import CourseCard from "@/components/CourseCard";
import CreateCourseModal from "@/components/CreateCourseModal";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { Plus, BookOpen, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Course {
  id: string;
  title: string;
  description: string;
  image_url: string;
  created_at: string;
  updated_at: string;
  slug: string;
  community_id: string;
  is_public: boolean;
}

// Loading spinner component following Fluid Movement design
function LoadingSpinner() {
  return (
    <div className="flex justify-center items-center min-h-screen bg-background">
      <div className="relative">
        <div className="h-12 w-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-6 rounded-full bg-primary/10 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// Skeleton card for loading state
function CourseCardSkeleton() {
  return (
    <div className="bg-card rounded-2xl overflow-hidden border border-border/50 animate-pulse">
      <div className="h-48 bg-muted/50" />
      <div className="p-5 space-y-3">
        <div className="h-5 bg-muted/50 rounded-xl w-3/4" />
        <div className="h-4 bg-muted/50 rounded-xl w-1/2" />
      </div>
    </div>
  );
}

// Empty state component
function EmptyState({ isCreator }: { isCreator: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <BookOpen className="h-10 w-10 text-primary" />
      </div>
      <h3 className="font-display text-xl font-semibold text-foreground mb-2 text-center">
        {isCreator ? "No courses yet" : "No courses available"}
      </h3>
      <p className="text-muted-foreground text-center max-w-md">
        {isCreator
          ? "Start building your classroom by creating your first course. Share your knowledge with your community members."
          : "This community hasn't published any courses yet. Check back soon for new learning content."}
      </p>
    </div>
  );
}

export default function ClassroomPage() {
  const params = useParams();
  const router = useRouter();
  const communitySlug = params?.communitySlug as string;
  const { user: currentUser, session, loading: isAuthLoading } = useAuth();

  const [error, setError] = useState<Error | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [isCreateCourseModalOpen, setIsCreateCourseModalOpen] = useState(false);
  const [membershipChecked, setMembershipChecked] = useState(false);
  const [profile, setProfile] = useState<{ is_admin: boolean } | null>(null);

  // Use SWR for community data
  const { data: community, error: communityError, isLoading: isCommunityLoading } = useSWR(
    membershipChecked ? `community:${communitySlug}` : null,
    fetcher
  );

  // Use SWR for courses data
  const { data: courses = [], mutate: mutateCourses, isLoading: isCoursesLoading } = useSWR(
    membershipChecked && community?.id
      ? `courses:${community.id}${!isCreator && !profile?.is_admin ? ':public' : ''}`
      : null,
    fetcher
  );

  // Check membership first
  useEffect(() => {
    async function checkMembership() {
      // Wait for auth to be fully initialized (loading done AND we have definitive state)
      if (isAuthLoading) return;
      if (!currentUser && session === undefined) return; // Still hydrating

      // Only redirect if user is definitely not logged in
      if (!currentUser || !session) {
        router.replace(`/${communitySlug}/about`);
        return;
      }

      try {
        // First check if user is admin via API
        const profileResponse = await fetch(`/api/profile?userId=${currentUser?.id}`);
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          setProfile(profileData);
        }

        // Get community data via API
        const communityResponse = await fetch(`/api/community/${communitySlug}`);
        if (!communityResponse.ok) {
          throw new Error("Community not found");
        }
        const communityData = await communityResponse.json();

        // Admins have access to all communities
        if (profile?.is_admin) {
          setMembershipChecked(true);
          setIsMember(true);
          return;
        }

        // Check if user is creator
        if (communityData.created_by === currentUser?.id) {
          setMembershipChecked(true);
          setIsMember(true);
          setIsCreator(true);
          return;
        }

        // Check if user is a member via API
        const memberResponse = await fetch(`/api/community/${communitySlug}/check-subscription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser?.id }),
        });

        setMembershipChecked(true);

        if (memberResponse.ok) {
          const memberData = await memberResponse.json();
          if (!memberData.hasSubscription) {
            router.replace(`/${communitySlug}/about`);
            return;
          }
          setIsMember(true);
        } else {
          router.replace(`/${communitySlug}/about`);
        }
      } catch (error) {
        console.error("Error checking membership:", error);
        setError(error instanceof Error ? error : new Error("Unknown error"));
        setMembershipChecked(true);
      }
    }

    checkMembership();
  }, [communitySlug, currentUser, isAuthLoading]);

  const handleCreateCourse = async (newCourse: any) => {
    try {
      const formData = new FormData();
      formData.append("title", newCourse.title);
      formData.append("description", newCourse.description);
      formData.append("image", newCourse.image as File);
      formData.append("is_public", "false");

      const response = await fetch(`/api/community/${communitySlug}/courses`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to create course");
      }

      const createdCourse = await response.json();
      mutateCourses([...courses, createdCourse], false);
      setIsCreateCourseModalOpen(false);
      toast.success("Course created successfully");
    } catch (error) {
      console.error("Error creating course:", error);
      toast.error("Failed to create course");
      mutateCourses();
    }
  };

  // Show loading state while checking membership
  if (isAuthLoading || !membershipChecked) {
    return <LoadingSpinner />;
  }

  // If we're not a member, don't show anything while redirecting
  if (!isMember) {
    return null;
  }

  // Show loading state for data fetching if we're confirmed as a member
  if (isCommunityLoading || isCoursesLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header skeleton */}
        <div className="flex justify-between items-center mb-8">
          <div className="h-10 w-40 bg-muted/50 rounded-xl animate-pulse" />
          {isCreator && (
            <div className="h-10 w-36 bg-muted/50 rounded-xl animate-pulse" />
          )}
        </div>
        {/* Course grid skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <CourseCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Show error state if any error occurred
  if (error || communityError) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-8 max-w-md text-center">
          <h2 className="font-display text-xl font-semibold text-destructive mb-2">
            Error loading classroom
          </h2>
          <p className="text-muted-foreground">
            {(error || communityError)?.message}
          </p>
        </div>
      </div>
    );
  }

  // Only show loading state for data fetching if we're confirmed as a member
  if (!community) {
    return <LoadingSpinner />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-foreground">
            Classroom
          </h1>
          <p className="text-muted-foreground mt-1">
            {courses.length > 0
              ? `${courses.length} course${courses.length !== 1 ? 's' : ''} available`
              : 'Explore courses and expand your skills'}
          </p>
        </div>
        {isCreator && (
          <Button
            onClick={() => setIsCreateCourseModalOpen(true)}
            className={cn(
              "bg-primary hover:bg-primary/90 text-primary-foreground",
              "rounded-xl px-5 h-11 font-medium",
              "transition-all duration-200 ease-out",
              "shadow-sm hover:shadow-md"
            )}
          >
            <Plus className="h-5 w-5 mr-2" />
            Create Course
              </Button>
            )}
          </div>

          {/* Course grid or empty state */}
          {courses.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((course: Course) => (
                <div key={course.id} className="relative">
                  <Link href={`/${communitySlug}/classroom/${course.slug}`}>
                    <CourseCard
                      course={course}
                      onClick={() => {}}
                    />
                  </Link>
                  {/* Private badge */}
                  {(isCreator || profile?.is_admin) && !course.is_public && (
                    <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-card/90 backdrop-blur-sm text-muted-foreground text-xs font-medium px-3 py-1.5 rounded-full border border-border/50 shadow-sm">
                      <Lock className="h-3 w-3" />
                      Private
                    </div>
                  )}
                </div>
              ))}
            </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm">
          <EmptyState isCreator={isCreator} />
        </div>
      )}

      <CreateCourseModal
        isOpen={isCreateCourseModalOpen}
        onClose={() => setIsCreateCourseModalOpen(false)}
        onCreateCourse={handleCreateCourse}
        communityId={community.id}
      />
    </div>
  );
}
