"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, BookOpen, Lock } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import CourseCard from "@/components/CourseCard";
import CreateCourseModal from "@/components/CreateCourseModal";
import type { Course } from "@/lib/community-data";

interface Props {
  communitySlug: string;
  communityId: string;
  isCreator: boolean;
  isAdmin: boolean;
  initialCourses: Course[];
}

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

export default function ClassroomPageClient({
  communitySlug,
  communityId,
  isCreator,
  isAdmin,
  initialCourses,
}: Props) {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>(initialCourses);
  const [isCreateCourseModalOpen, setIsCreateCourseModalOpen] = useState(false);

  const canSeePrivate = isCreator || isAdmin;

  const handleCreateCourse = async (newCourse: {
    title: string;
    description: string;
    image: File | null;
    community_id: string;
    created_at: string;
    updated_at: string;
    slug: string;
    is_public: boolean;
  }) => {
    try {
      const formData = new FormData();
      formData.append("title", newCourse.title);
      formData.append("description", newCourse.description);
      if (newCourse.image) formData.append("image", newCourse.image);
      formData.append("is_public", "false");

      const response = await fetch(`/api/community/${communitySlug}/courses`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to create course");
      }

      const createdCourse = await response.json();
      setCourses((prev) => [createdCourse, ...prev]);
      setIsCreateCourseModalOpen(false);
      toast.success("Course created successfully");
      // Purge the Router Cache so nav-away-and-back hits the server fresh.
      router.refresh();
    } catch (error) {
      console.error("Error creating course:", error);
      toast.error("Failed to create course");
    }
  };

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
          {courses.map((course) => (
            <div key={course.id} className="relative">
              <Link href={`/${communitySlug}/classroom/${course.slug}`}>
                <CourseCard course={course} onClick={() => {}} />
              </Link>
              {/* Private badge — only visible to viewers who can see private */}
              {canSeePrivate && !course.is_public && (
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
        communityId={communityId}
      />
    </div>
  );
}
