"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Play,
  FileText,
  CheckCircle,
  CheckCircle2,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import type { Course } from "@/types/course";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";

const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { DraggableItem } from "@/components/DraggableItem";
import { Card } from "@/components/ui/card";
import VideoUpload from "@/components/VideoUpload";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MuxPlayer } from "@/components/MuxPlayer";
import Editor from "@/components/Editor";
import EditCourseModal from "@/components/EditCourseModal";
import NotifyMembersModal from "@/components/NotifyMembersModal";
import DeleteLessonModal from "@/components/DeleteLessonModal";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

interface Chapter {
  id: string;
  title: string;
  lessons: Lesson[];
  order?: number;
  position?: number;
  chapter_position?: number;
}

interface Lesson {
  id: string;
  title: string;
  content: string | null;
  videoUrl?: string;
  videoAssetId?: string | null;
  playbackId?: string | null;
  completed?: boolean;
  order?: number;
  position?: number;
  lesson_position?: number;
  chapter_id: string;
}

interface Community {
  id: string;
  name: string;
  created_by: string;
}

// Inline lesson content editor component
interface InlineLessonEditorProps {
  lesson: Lesson;
  onSave: (lessonData: {
    content: string;
    videoAssetId?: string;
    playbackId?: string;
  }) => Promise<void>;
  isEditMode: boolean;
  communityId: string;
}

function InlineLessonContent({
  lesson,
  onSave,
  isEditMode,
  communityId,
}: InlineLessonEditorProps) {
  const [isEditingText, setIsEditingText] = useState(false);
  const [isChangingVideo, setIsChangingVideo] = useState(false);
  const [editedContent, setEditedContent] = useState(lesson.content || "");
  const [isSaving, setIsSaving] = useState(false);

  // Reset state when lesson changes
  useEffect(() => {
    setEditedContent(lesson.content || "");
    setIsEditingText(false);
    setIsChangingVideo(false);
  }, [lesson.id, lesson.content]);

  const handleSaveContent = async () => {
    setIsSaving(true);
    try {
      await onSave({
        content: editedContent,
        videoAssetId: lesson.videoAssetId || undefined,
        playbackId: lesson.playbackId || undefined
      });
      setIsEditingText(false);
      toast.success("Content updated");
    } catch (error) {
      toast.error("Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedContent(lesson.content || "");
    setIsEditingText(false);
  };

  const handleVideoUpload = async (assetId: string, playbackId: string) => {
    try {
      await onSave({
        content: lesson.content || "",
        videoAssetId: assetId,
        playbackId: playbackId,
      });
      setIsChangingVideo(false);
      toast.success("Video updated");
    } catch (error) {
      toast.error("Failed to update video");
    }
  };

  return (
    <div className="space-y-6">
      {/* Video Section */}
      {(lesson.playbackId || (isEditMode && isChangingVideo)) && (
        <div className="relative">
          {lesson.playbackId && !isChangingVideo ? (
            <>
              <div className="rounded-2xl overflow-hidden border border-border/50 shadow-sm bg-black">
                <MuxPlayer playbackId={lesson.playbackId} />
              </div>
              {/* Small edit button in corner - doesn't block video playback */}
              {isEditMode && (
                <Button
                  onClick={() => setIsChangingVideo(true)}
                  size="sm"
                  className="absolute top-3 right-3 rounded-xl bg-black/60 hover:bg-black/80 text-white border border-white/20 backdrop-blur-sm shadow-lg"
                >
                  <Edit2 className="w-3.5 h-3.5 mr-1.5" />
                  Change
                </Button>
              )}
            </>
          ) : isChangingVideo ? (
            <div className="rounded-2xl border-2 border-dashed border-border bg-muted/30 p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium text-foreground">Upload New Video</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsChangingVideo(false)}
                  className="rounded-lg hover:bg-muted"
                >
                  Cancel
                </Button>
              </div>
              <VideoUpload
                communityId={communityId}
                onUploadComplete={(assetId, playbackId) => handleVideoUpload(assetId, playbackId)}
                onUploadError={(error) => toast.error(error)}
              />
            </div>
          ) : null}
        </div>
      )}

      {/* Add video button when no video exists */}
      {!lesson.playbackId && isEditMode && !isChangingVideo && (
        <button
          onClick={() => setIsChangingVideo(true)}
          className={cn(
            "w-full rounded-2xl border-2 border-dashed border-border/50 p-8",
            "flex flex-col items-center justify-center gap-3",
            "text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-muted/30",
            "transition-all duration-200"
          )}
        >
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Play className="h-6 w-6 text-primary" />
          </div>
          <span className="font-medium">Add Video</span>
        </button>
      )}

      {/* Text Content Section */}
      <div className="relative">
        {isEditingText ? (
          <div className="space-y-4">
            <Editor
              key={`editor-${lesson.id}`}
              content={editedContent}
              onChange={setEditedContent}
              placeholder="Enter lesson content..."
              minHeight="150px"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleCancelEdit}
                disabled={isSaving}
                className="rounded-xl border-border/50 hover:bg-muted"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveContent}
                disabled={isSaving}
                className="rounded-xl bg-primary hover:bg-primary/90"
              >
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="group relative">
            {lesson.content ? (
              <div
                className={cn(
                  "bg-muted/30 rounded-2xl p-6 md:p-8 border border-border/50",
                  isEditMode && "cursor-pointer hover:border-primary/30 transition-all duration-200"
                )}
                onClick={() => isEditMode && setIsEditingText(true)}
              >
                <div
                  className={cn(
                    "prose prose-slate max-w-none",
                    "prose-headings:font-display prose-headings:text-foreground",
                    "prose-p:text-muted-foreground prose-p:my-2 prose-a:text-primary",
                    "prose-ul:list-disc prose-ul:pl-6 prose-ul:my-2",
                    "prose-ol:list-decimal prose-ol:pl-6 prose-ol:my-2",
                    "prose-li:my-0.5 prose-li:text-muted-foreground",
                    "[&_li>p]:my-0 [&_li>p]:inline",
                    "prose-blockquote:border-l-4 prose-blockquote:border-primary/30 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-muted-foreground"
                  )}
                  dangerouslySetInnerHTML={{
                    __html: lesson.content,
                  }}
                />
                {/* Edit hint overlay */}
                {isEditMode && (
                  <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-all duration-200 rounded-2xl flex items-center justify-center">
                    <div className="bg-card/90 backdrop-blur-sm px-4 py-2 rounded-xl border border-border/50 shadow-sm flex items-center gap-2 text-sm font-medium text-foreground">
                      <Edit2 className="w-4 h-4" />
                      Click to edit
                    </div>
                  </div>
                )}
              </div>
            ) : isEditMode ? (
              <button
                onClick={() => setIsEditingText(true)}
                className={cn(
                  "w-full rounded-2xl border-2 border-dashed border-border/50 p-8",
                  "flex flex-col items-center justify-center gap-3",
                  "text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-muted/30",
                  "transition-all duration-200"
                )}
              >
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <span className="font-medium">Add Content</span>
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

interface CourseDetailClientProps {
  communitySlug: string;
  courseSlug: string;
  community: Community;
  initialCourse: Course;
  isCreator: boolean;
  isAdmin: boolean;
}

export default function CourseDetailClient({
  communitySlug,
  courseSlug,
  community: initialCommunity,
  initialCourse,
  isCreator,
}: CourseDetailClientProps) {
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(initialCourse);
  const [chapters, setChapters] = useState<Chapter[]>(initialCourse.chapters || []);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddingChapter, setIsAddingChapter] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState("");
  const [isAddingLesson, setIsAddingLesson] = useState<string | null>(null);
  const [newLessonTitle, setNewLessonTitle] = useState("");
  const community = initialCommunity;
  const [isEditingCourse, setIsEditingCourse] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [lessonToDelete, setLessonToDelete] = useState<{
    chapterId: string;
    lessonId: string;
    title: string;
  } | null>(null);

  const { user, session, loading: authLoading } = useAuth();

  // SWR hydrates from initialCourse and only revalidates when we explicitly
  // call mutate after a write — the server-side fetch in page.tsx already
  // produced the freshest tree.
  const { data: courseData, error: courseError, mutate: mutateCourse } = useSWR(
    `course:${communitySlug}:${courseSlug}`,
    fetcher,
    {
      fallbackData: initialCourse,
      revalidateOnMount: false,
      revalidateOnFocus: false,
    }
  );

  // (Auth + access gating now happens server-side in page.tsx; community
  // and access flags arrive as props, so no client check needed here.)

  // Mirror SWR data into chapters/course local state. selectedLesson is only
  // assigned here on first hydration (or when the previously selected lesson
  // disappeared) — otherwise revalidating the course tree would yank the user
  // out of the lesson they're reading.
  useEffect(() => {
    if (!courseData) return;
    setCourse(courseData);
    setChapters(courseData.chapters || []);
    setIsLoading(false);

    setSelectedLesson((prev) => {
      const allLessons = (courseData.chapters || []).flatMap((c: Chapter) => c.lessons || []);
      if (prev && allLessons.some((l: Lesson) => l.id === prev.id)) {
        return prev;
      }
      const nextLesson = allLessons.find((l: Lesson) => !l.completed);
      return nextLesson || allLessons[0] || null;
    });
  }, [courseData]);

  const [expandedChapters, setExpandedChapters] = useState<{
    [key: string]: boolean;
  }>({});

  // Set initial expanded state for first chapter
  useEffect(() => {
    if (chapters.length > 0) {
      setExpandedChapters((prev) => ({
        ...prev,
        [chapters[0].id]: true,
      }));
    }
  }, [chapters]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const toggleChapter = (chapterId: string) => {
    setExpandedChapters((prev) => ({
      ...prev,
      [chapterId]: !prev[chapterId],
    }));
  };

  const handleAddChapter = async () => {
    if (!newChapterTitle.trim()) return;

    try {
      const response = await fetch(
        `/api/community/${communitySlug}/courses/${courseSlug}/chapters`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title: newChapterTitle }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to add chapter");
      }

      const newChapter = await response.json();
      setChapters((prevChapters) => [...prevChapters, newChapter]);
      setNewChapterTitle("");
      setIsAddingChapter(false);
      toast.success("Chapter added successfully");
      mutateCourse();
    } catch (error) {
      console.error("Error adding chapter:", error);
      toast.error("Failed to add chapter");
    }
  };

  // Replace the AddLessonDialog with inline lesson creation
  const handleAddLesson = async (chapterId: string, title: string) => {
    if (!title.trim()) return;

    if (!session) {
      toast.error("Please sign in");
      return;
    }

    try {
      const response = await fetch(
        `/api/community/${communitySlug}/courses/${courseSlug}/chapters/${chapterId}/lessons`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to add lesson");
      }

      const newLesson = await response.json();

      // Update chapters state with the new lesson
      setChapters((prevChapters) =>
        prevChapters.map((chapter) =>
          chapter.id === chapterId
            ? {
                ...chapter,
                lessons: [...chapter.lessons, newLesson],
              }
            : chapter
        )
      );

      // Clear form and close dialog
      setNewLessonTitle("");
      setIsAddingLesson(null);

      // Select the new lesson
      setSelectedLesson(newLesson);
      toast.success("Lesson added successfully");
      mutateCourse();
    } catch (error) {
      console.error("Error adding lesson:", error);
      toast.error("Failed to add lesson");
    }
  };

  // Update handleUpdateLesson
  const handleUpdateLesson = async (lessonData: {
    content: string;
    videoAssetId?: string;
    playbackId?: string;
  }) => {
    if (!selectedLesson) return;

    const currentChapter = chapters.find((chapter) =>
      chapter.lessons.some((lesson) => lesson.id === selectedLesson.id)
    );
    if (!currentChapter) return;

    if (!session) {
      toast.error("Please sign in");
      return;
    }

    try {
      const response = await fetch(
        `/api/community/${communitySlug}/courses/${courseSlug}/chapters/${currentChapter.id}/lessons/${selectedLesson.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: selectedLesson.title,
            content: lessonData.content,
            videoAssetId: lessonData.videoAssetId,
            playbackId: lessonData.playbackId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update lesson");
      }

      const updatedLesson = await response.json();
      setChapters((prevChapters) =>
        prevChapters.map((chapter) =>
          chapter.id === currentChapter.id
            ? {
                ...chapter,
                lessons: chapter.lessons.map((lesson) =>
                  lesson.id === selectedLesson.id ? updatedLesson : lesson
                ),
              }
            : chapter
        )
      );
      setSelectedLesson(updatedLesson);
      mutateCourse();
    } catch (error) {
      throw error;
    }
  };

  // Update handleEditChapter
  const handleEditChapter = async (chapterId: string, title: string) => {
    try {
      const response = await fetch(
        `/api/community/${communitySlug}/courses/${courseSlug}/chapters/${chapterId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update chapter");
      }

      setChapters((prevChapters) =>
        prevChapters.map((chapter) =>
          chapter.id === chapterId ? { ...chapter, title } : chapter
        )
      );
      toast.success("Chapter updated successfully");
      mutateCourse();
    } catch (error) {
      console.error("Error updating chapter:", error);
      toast.error("Failed to update chapter");
    }
  };

  // Update handleDeleteChapter
  const handleDeleteChapter = async (chapterId: string) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this chapter and all its lessons? This action cannot be undone."
    );
    if (!confirmDelete) return;

    if (!session) {
      toast.error("Please sign in");
      return;
    }

    try {
      const response = await fetch(
        `/api/community/${communitySlug}/courses/${courseSlug}/chapters/${chapterId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to delete chapter");
      }

      setChapters((prevChapters) =>
        prevChapters.filter((chapter) => chapter.id !== chapterId)
      );

      if (
        selectedLesson &&
        chapters
          .find((c) => c.id === chapterId)
          ?.lessons.find((l) => l.id === selectedLesson.id)
      ) {
        setSelectedLesson(null);
      }

      toast.success("Chapter deleted successfully");
      mutateCourse();
    } catch (error) {
      console.error("Error deleting chapter:", error);
      toast.error("Failed to delete chapter");
    }
  };

  const handleDeleteLesson = async (
    chapterId: string,
    lessonId: string,
    lessonTitle: string
  ) => {
    setLessonToDelete({ chapterId, lessonId, title: lessonTitle });
  };

  const confirmDeleteLesson = async () => {
    if (!lessonToDelete) return;

    if (!session) {
      toast.error("Please sign in");
      return;
    }

    try {
      const response = await fetch(
        `/api/community/${communitySlug}/courses/${courseSlug}/chapters/${lessonToDelete.chapterId}/lessons/${lessonToDelete.lessonId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to delete lesson");
      }

      setChapters((prevChapters) =>
        prevChapters.map((chapter) =>
          chapter.id === lessonToDelete.chapterId
            ? {
                ...chapter,
                lessons: chapter.lessons.filter(
                  (lesson) => lesson.id !== lessonToDelete.lessonId
                ),
              }
            : chapter
        )
      );

      // If the deleted lesson was selected, clear the selection
      if (selectedLesson?.id === lessonToDelete.lessonId) {
        setSelectedLesson(null);
      }

      toast.success("Lesson deleted successfully");
      mutateCourse();
    } catch (error) {
      console.error("Error deleting lesson:", error);
      toast.error("Failed to delete lesson");
    } finally {
      setLessonToDelete(null);
    }
  };

  const handleEditCourse = () => {
    setIsEditingCourse(true);
  };

  // Update handleUpdateCourse
  const handleUpdateCourse = async (updates: {
    title: string;
    description: string;
    image?: File | null;
    is_public: boolean;
  }) => {
    try {
      const formData = new FormData();
      formData.append("title", updates.title);
      formData.append("description", updates.description);
      formData.append("is_public", updates.is_public.toString());
      if (updates.image) {
        formData.append("image", updates.image);
      }

      const response = await fetch(
        `/api/community/${communitySlug}/courses/${courseSlug}`,
        {
          method: "PUT",
          body: formData,
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update course");
      }

      const { course, madePublic } = await response.json();
      setCourse(course);

      if (madePublic) {
        setShowNotifyModal(true);
      }

      toast.success("Course updated successfully");
      setIsEditingCourse(false);

      // If the title change produced a new slug, the current URL is now
      // stale — replace it. router.refresh() also re-renders the parent RSC
      // tree (classroom listing) so the renamed title shows up there too.
      if (course.slug && course.slug !== courseSlug) {
        router.replace(`/${communitySlug}/classroom/${course.slug}`);
      } else {
        mutateCourse();
        router.refresh();
      }
    } catch (error) {
      console.error("Error updating course:", error);
      toast.error("Error updating course");
    }
  };

  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const isProcessingRef = useRef(false);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    if (active.id !== over.id) {
      setChapters((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        const newOrder = arrayMove(items, oldIndex, newIndex);

        updateChaptersOrder(newOrder);

        return newOrder;
      });
    }
  };

  const handleLessonDragEnd = async (chapterId: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    if (active.id !== over.id && !isProcessingRef.current) {
      isProcessingRef.current = true;

      try {
        const chapter = chapters.find((c) => c.id === chapterId);
        if (!chapter) return;

        const lessons = [...chapter.lessons];
        const oldIndex = lessons.findIndex((lesson) => lesson.id === active.id);
        const newIndex = lessons.findIndex((lesson) => lesson.id === over.id);

        // Only update if indices are different
        if (oldIndex === newIndex) return;

        // Move the lesson to its new position
        const [movedLesson] = lessons.splice(oldIndex, 1);
        lessons.splice(newIndex, 0, movedLesson);

        // Update positions based on new order
        const newLessons = lessons.map((lesson, index) => ({
          ...lesson,
          lesson_position: index,
        }));

        // Update UI state immediately with the new order
        setChapters((prevChapters) =>
          prevChapters.map((c) =>
            c.id === chapterId ? { ...c, lessons: newLessons } : c
          )
        );

        // Make the API call
        await updateLessonsOrder(chapterId, newLessons);

        // Force a refresh of the data from the server
      } catch (error) {
        console.error("Error in handleLessonDragEnd:", error);
        toast.error("Failed to update lesson order");
        // On error, force a refresh to get back to the server state
      } finally {
        isProcessingRef.current = false;
      }
    }
  };

  // Update updateChaptersOrder
  const updateChaptersOrder = async (chapters: Chapter[]) => {
    if (!isCreator || !isEditMode || isSavingOrder) return;

    if (!session) {
      toast.error("Please sign in");
      return;
    }

    try {
      setIsSavingOrder(true);
      const response = await fetch(
        `/api/community/${communitySlug}/courses/${courseSlug}/chapters/reorder`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ chapters }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update chapters order");
      }

      toast.success("Order updated", {
        duration: 2000,
        position: "bottom-right",
      });
      mutateCourse();
    } catch (error) {
      console.error("Error updating chapters order:", error);
      toast.error("Failed to update order");
    } finally {
      setIsSavingOrder(false);
    }
  };

  // Update updateLessonsOrder
  const updateLessonsOrder = async (chapterId: string, lessons: Lesson[]) => {
    if (!isCreator || !isEditMode || isSavingOrder) return;

    if (!session) {
      toast.error("Please sign in");
      return;
    }

    try {
      setIsSavingOrder(true);
      const response = await fetch(
        `/api/community/${communitySlug}/courses/${courseSlug}/chapters/${chapterId}/lessons/reorder`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ lessons }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update lessons order");
      }

      toast.success("Order updated", {
        duration: 2000,
        position: "bottom-right",
      });
      mutateCourse();
    } catch (error) {
      console.error("Error updating lessons order:", error);
      toast.error("Failed to update order");
    } finally {
      setIsSavingOrder(false);
    }
  };

  const toggleLessonCompletion = async (lessonId: string) => {
    if (!session) {
      toast.error("Please sign in");
      return;
    }

    try {
      const response = await fetch(
        `/api/community/${communitySlug}/courses/${courseSlug}/chapters/${selectedLesson?.chapter_id}/lessons/${lessonId}/completion`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to toggle completion status");
      }

      const { completed } = await response.json();

      // Update the chapters state with the new completion status
      setChapters((prevChapters) =>
        prevChapters.map((chapter) => ({
          ...chapter,
          lessons: chapter.lessons.map((lesson) =>
            lesson.id === lessonId ? { ...lesson, completed } : lesson
          ),
        }))
      );

      // Update selected lesson if it's the one being toggled
      if (selectedLesson?.id === lessonId) {
        setSelectedLesson((prev) => (prev ? { ...prev, completed } : null));
      }

      toast.success(
        completed ? "Lesson marked as completed" : "Lesson marked as incomplete"
      );
      mutateCourse();
    } catch (error) {
      console.error("Error toggling lesson completion:", error);
      toast.error("Failed to update lesson status");
    }
  };

  const renderLessonContent = (): JSX.Element => {
    if (!selectedLesson) {
      return (
        <div className="flex flex-col items-center justify-center h-[400px] text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <p className="text-muted-foreground font-medium">Select a lesson to begin</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Choose from the course content on the left</p>
        </div>
      );
    }

    return (
      <div className="space-y-8">
        {/* Lesson Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl md:text-3xl font-semibold text-foreground mb-2">
              {selectedLesson.title}
            </h2>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {selectedLesson.playbackId && (
                <div className="flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1 rounded-full">
                  <Play className="w-3.5 h-3.5" />
                  <span className="font-medium">Video</span>
                </div>
              )}
              {selectedLesson.content && (
                <div className="flex items-center gap-1.5 bg-muted px-3 py-1 rounded-full">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Reading material</span>
                </div>
              )}
            </div>
          </div>
          <Button
            variant={selectedLesson.completed ? "default" : "outline"}
            onClick={() => toggleLessonCompletion(selectedLesson.id)}
            className={cn(
              "flex items-center gap-2 rounded-xl transition-all duration-200",
              selectedLesson.completed
                ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                : "border-border/50 hover:bg-muted hover:border-primary/30"
            )}
          >
            <CheckCircle2
              className={cn(
                "w-5 h-5",
                selectedLesson.completed ? "text-white" : "text-muted-foreground"
              )}
            />
            {selectedLesson.completed ? "Completed" : "Mark as Complete"}
          </Button>
        </div>

        {/* Lesson Content - Video & Text with inline editing */}
        <InlineLessonContent
          key={selectedLesson.id}
          lesson={selectedLesson}
          onSave={handleUpdateLesson}
          isEditMode={isCreator && isEditMode}
          communityId={initialCommunity.id}
        />

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-4 border-t border-border/50">
          <Button
            variant="outline"
            onClick={() => {
              const currentChapter = chapters.find((chapter) =>
                chapter.lessons.some(
                  (lesson) => lesson.id === selectedLesson.id
                )
              );
              if (!currentChapter) return;

              const currentLessonIndex = currentChapter.lessons.findIndex(
                (lesson) => lesson.id === selectedLesson.id
              );

              if (currentLessonIndex > 0) {
                setSelectedLesson(
                  currentChapter.lessons[currentLessonIndex - 1]
                );
              } else {
                const currentChapterIndex = chapters.findIndex(
                  (chapter) => chapter.id === currentChapter.id
                );
                if (currentChapterIndex > 0) {
                  const previousChapter = chapters[currentChapterIndex - 1];
                  setSelectedLesson(
                    previousChapter.lessons[previousChapter.lessons.length - 1]
                  );
                }
              }
            }}
            disabled={selectedLesson.id === chapters[0]?.lessons[0]?.id}
            className="rounded-xl border-border/50 hover:bg-muted hover:border-primary/30 transition-all duration-200 gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous Lesson
          </Button>
          <Button
            onClick={() => {
              const currentChapter = chapters.find((chapter) =>
                chapter.lessons.some(
                  (lesson) => lesson.id === selectedLesson.id
                )
              );
              if (!currentChapter) return;

              const currentLessonIndex = currentChapter.lessons.findIndex(
                (lesson) => lesson.id === selectedLesson.id
              );

              if (currentLessonIndex < currentChapter.lessons.length - 1) {
                setSelectedLesson(
                  currentChapter.lessons[currentLessonIndex + 1]
                );
              } else {
                const currentChapterIndex = chapters.findIndex(
                  (chapter) => chapter.id === currentChapter.id
                );
                if (currentChapterIndex < chapters.length - 1) {
                  const nextChapter = chapters[currentChapterIndex + 1];
                  setSelectedLesson(nextChapter.lessons[0]);
                }
              }
            }}
            disabled={
              selectedLesson.id ===
              chapters[chapters.length - 1]?.lessons[
                chapters[chapters.length - 1]?.lessons.length - 1
              ]?.id
            }
            className="rounded-xl bg-primary hover:bg-primary/90 transition-all duration-200 gap-2"
          >
            Next Lesson
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center py-16">
        <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center animate-pulse">
          <BookOpen className="w-6 h-6 text-primary" />
        </div>
        <p className="mt-4 text-muted-foreground font-medium">Loading course...</p>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex flex-col justify-center items-center py-16">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
          <BookOpen className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="font-display text-xl font-semibold text-foreground">Course not found</h2>
        <p className="text-muted-foreground mt-1">This course may have been removed or doesn&apos;t exist.</p>
      </div>
    );
  }

  // isCreator is provided as a prop (server-resolved); no local derivation.

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Course Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div>
              <h1 className="font-display text-3xl md:text-4xl font-semibold text-foreground">
                {course.title}
              </h1>
              {course.description && (
                <p className="text-muted-foreground mt-2 max-w-2xl">
                  {course.description}
                </p>
              )}
            </div>
            {isCreator && user && community && (
              <div className="flex gap-2 flex-shrink-0">
                <Button
                  onClick={handleEditCourse}
                  variant="outline"
                  className="rounded-xl border-border/50 hover:bg-muted hover:border-primary/30 transition-all duration-200"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </Button>
                <Button
                  onClick={() => setIsEditMode(!isEditMode)}
                  className={cn(
                    "rounded-xl transition-all duration-200",
                    isEditMode
                      ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                      : "bg-primary hover:bg-primary/90"
                  )}
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  {isEditMode ? "Done Editing" : "Edit Content"}
                </Button>
              </div>
            )}
          </div>

          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
            {/* Left section: Course index */}
            <div className="w-full lg:w-80 flex-shrink-0">
              <div className="sticky top-24">
                <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-border/50">
                    <h2 className="font-display text-lg font-semibold text-foreground">Course Content</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {chapters.reduce((acc, ch) => acc + ch.lessons.length, 0)} lessons
                    </p>
                  </div>
                  <div className="p-3 max-h-[60vh] overflow-y-auto">

              {isCreator && isEditMode ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                  autoScroll={false}
                  modifiers={[restrictToVerticalAxis]}
                >
                  <SortableContext
                    items={chapters.map((chapter) => chapter.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {chapters.map((chapter) => (
                      <div key={chapter.id} className="mb-2">
                        <DraggableItem id={chapter.id}>
                          <div className="flex-1">
                            <div
                              className={cn(
                                "flex justify-between items-center cursor-pointer p-3 rounded-xl transition-all duration-200",
                                "hover:bg-muted/50 group"
                              )}
                              onClick={() => toggleChapter(chapter.id)}
                            >
                              <div className="flex items-center gap-2">
                                <h3 className="font-display font-medium text-foreground">
                                  {chapter.title}
                                </h3>
                              </div>
                              <div className="flex items-center gap-1">
                                {isCreator && isEditMode && (
                                  <div
                                    className="flex gap-1"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Button
                                      onClick={() =>
                                        handleDeleteChapter(chapter.id)
                                      }
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0 text-destructive/70 hover:text-destructive hover:bg-destructive/10 rounded-lg"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                )}
                                {expandedChapters[chapter.id] ? (
                                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                )}
                              </div>
                            </div>

                            {expandedChapters[chapter.id] && (
                              <>
                                <DndContext
                                  sensors={sensors}
                                  collisionDetection={closestCenter}
                                  onDragEnd={(event) =>
                                    handleLessonDragEnd(chapter.id, event)
                                  }
                                  autoScroll={false}
                                  modifiers={[restrictToVerticalAxis]}
                                >
                                  <SortableContext
                                    items={(chapter.lessons || []).map(
                                      (lesson) => lesson.id
                                    )}
                                    strategy={verticalListSortingStrategy}
                                  >
                                    <ul className="ml-4 space-y-1 border-l-2 border-border/30 pl-3">
                                      {(chapter.lessons || []).map((lesson) => (
                                        <DraggableItem
                                          key={lesson.id}
                                          id={lesson.id}
                                        >
                                          <li
                                            className={cn(
                                              "flex-1 flex justify-between items-center py-2 px-3 rounded-lg transition-all duration-200 group/lesson",
                                              selectedLesson?.id === lesson.id
                                                ? "bg-primary/10 border-l-2 border-primary -ml-[3px] pl-[11px]"
                                                : "hover:bg-muted/50"
                                            )}
                                          >
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                              <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                                                {lesson.completed ? (
                                                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                ) : (
                                                  <div className="w-3 h-3 rounded-full border-2 border-muted-foreground/30" />
                                                )}
                                              </div>
                                              <span
                                                className={cn(
                                                  "cursor-pointer text-sm truncate transition-colors duration-200",
                                                  selectedLesson?.id === lesson.id
                                                    ? "text-primary font-medium"
                                                    : "text-foreground hover:text-primary"
                                                )}
                                                onClick={() =>
                                                  setSelectedLesson(lesson)
                                                }
                                              >
                                                {lesson.title}
                                              </span>
                                            </div>
                                            {isCreator && isEditMode && (
                                              <Button
                                                onClick={() =>
                                                  handleDeleteLesson(
                                                    chapter.id,
                                                    lesson.id,
                                                    lesson.title
                                                  )
                                                }
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 w-7 p-0 text-destructive/70 hover:text-destructive hover:bg-destructive/10 rounded-lg opacity-0 group-hover/lesson:opacity-100 transition-opacity"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </Button>
                                            )}
                                          </li>
                                        </DraggableItem>
                                      ))}
                                    </ul>
                                  </SortableContext>
                                </DndContext>

                                {/* Add Lesson form at the bottom */}
                                {isCreator && isEditMode && (
                                  <div className="ml-4 mt-2 pl-3 border-l-2 border-border/30">
                                    {isAddingLesson === chapter.id ? (
                                      <div className="p-3 bg-muted/30 rounded-xl">
                                        <Input
                                          value={newLessonTitle}
                                          onChange={(e) =>
                                            setNewLessonTitle(e.target.value)
                                          }
                                          placeholder="Lesson title"
                                          className="mb-2 rounded-lg border-border/50 text-sm"
                                        />
                                        <div className="flex gap-2">
                                          <Button
                                            onClick={() =>
                                              handleAddLesson(
                                                chapter.id,
                                                newLessonTitle
                                              )
                                            }
                                            size="sm"
                                            className="rounded-lg bg-primary hover:bg-primary/90"
                                          >
                                            Save
                                          </Button>
                                          <Button
                                            onClick={() => {
                                              setIsAddingLesson(null);
                                              setNewLessonTitle("");
                                            }}
                                            variant="outline"
                                            size="sm"
                                            className="rounded-lg border-border/50"
                                          >
                                            Cancel
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <Button
                                        onClick={() =>
                                          setIsAddingLesson(chapter.id)
                                        }
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-primary hover:text-primary hover:bg-primary/10 rounded-lg text-sm"
                                      >
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add Lesson
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </DraggableItem>
                      </div>
                    ))}
                  </SortableContext>
                </DndContext>
              ) : (
                // Regular view when not in edit mode
                chapters.map((chapter) => (
                  <div key={chapter.id} className="mb-2">
                    <div
                      className={cn(
                        "flex justify-between items-center cursor-pointer p-3 rounded-xl transition-all duration-200",
                        "hover:bg-muted/50"
                      )}
                      onClick={() => toggleChapter(chapter.id)}
                    >
                      <h3 className="font-display font-medium text-foreground">
                        {chapter.title}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {chapter.lessons.filter(l => l.completed).length}/{chapter.lessons.length}
                        </span>
                        {expandedChapters[chapter.id] ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {expandedChapters[chapter.id] && (
                      <ul className="ml-4 space-y-1 border-l-2 border-border/30 pl-3">
                        {chapter.lessons.map((lesson) => (
                          <li
                            key={lesson.id}
                            className={cn(
                              "flex justify-between items-center py-2 px-3 rounded-lg transition-all duration-200 cursor-pointer",
                              selectedLesson?.id === lesson.id
                                ? "bg-primary/10 border-l-2 border-primary -ml-[3px] pl-[11px]"
                                : "hover:bg-muted/50"
                            )}
                            onClick={() => setSelectedLesson(lesson)}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                                {lesson.completed ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                ) : (
                                  <div className="w-3 h-3 rounded-full border-2 border-muted-foreground/30" />
                                )}
                              </div>
                              <span
                                className={cn(
                                  "text-sm truncate transition-colors duration-200",
                                  selectedLesson?.id === lesson.id
                                    ? "text-primary font-medium"
                                    : "text-foreground"
                                )}
                              >
                                {lesson.title}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              )}

              {isCreator && isEditMode && (
                <div className="mt-4 pt-4 border-t border-border/50">
                  {isAddingChapter ? (
                    <div className="p-3 bg-muted/30 rounded-xl">
                      <Input
                        value={newChapterTitle}
                        onChange={(e) => setNewChapterTitle(e.target.value)}
                        placeholder="Chapter title"
                        className="mb-2 rounded-lg border-border/50 text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={handleAddChapter}
                          size="sm"
                          className="rounded-lg bg-primary hover:bg-primary/90"
                        >
                          Save
                        </Button>
                        <Button
                          onClick={() => {
                            setIsAddingChapter(false);
                            setNewChapterTitle("");
                          }}
                          variant="outline"
                          size="sm"
                          className="rounded-lg border-border/50"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => setIsAddingChapter(true)}
                      className="w-full rounded-xl bg-primary hover:bg-primary/90 text-white"
                      size="sm"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Chapter
                    </Button>
                  )}
                </div>
              )}
                  </div>
                </div>
              </div>
            </div>

            {/* Center/right section: Course content */}
            <div className="flex-1 min-w-0">
              <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-6 md:p-8">
                {renderLessonContent()}
              </div>
            </div>
          </div>
      </div>

      {course && (
        <EditCourseModal
          isOpen={isEditingCourse}
          onClose={() => setIsEditingCourse(false)}
          course={course}
          onUpdateCourse={handleUpdateCourse}
        />
      )}

      <NotifyMembersModal
        isOpen={showNotifyModal}
        onClose={() => setShowNotifyModal(false)}
        courseName={course?.title || ""}
        communitySlug={communitySlug}
        courseSlug={courseSlug}
      />

      <DeleteLessonModal
        isOpen={!!lessonToDelete}
        onClose={() => setLessonToDelete(null)}
        onConfirm={confirmDeleteLesson}
        lessonTitle={lessonToDelete?.title || ""}
      />
    </>
  );
}
