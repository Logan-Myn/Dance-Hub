"use client";

import { useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { AppDialog, FIELD_INPUT, FIELD_LABEL } from "@/components/ds/app-dialog";
import { InlineConfirm } from "@/components/ds/inline-confirm";
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY } from "@/components/community-feed/feed-header";
import { cn } from "@/lib/utils";
import type { Course } from "@/types/course";

interface EditCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  course: Course;
  onUpdateCourse: (updates: {
    title: string;
    description: string;
    image?: File | null;
    is_public: boolean;
  }) => Promise<void>;
  onDeleteCourse?: () => Promise<void>;
}

/** Course settings: name, description, cover, visibility, delete. */
export default function EditCourseModal({ isOpen, onClose, course, onUpdateCourse, onDeleteCourse }: EditCourseModalProps) {
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description || "");
  const [isPublic, setIsPublic] = useState(course.is_public ?? true);
  const [image, setImage] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const chosen = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => () => {
    if (chosen) URL.revokeObjectURL(chosen);
  }, [chosen]);
  const cover = chosen ?? (course.image_url && !course.image_url.endsWith("/course-placeholder.svg") ? course.image_url : null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files: File[]) => files[0] && setImage(files[0]),
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"] },
    maxFiles: 1,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onUpdateCourse({ title, description, image, is_public: isPublic });
      // Success feedback belongs to the caller, which knows whether the save
      // also published the course.
    } catch (error) {
      console.error("Error updating course:", error);
      toast.error(error instanceof Error ? error.message : "Couldn't save the course.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!onDeleteCourse) return;
    setIsDeleting(true);
    try {
      await onDeleteCourse();
      // The caller navigates away on success, so there is no state to reset.
    } catch (error) {
      console.error("Error deleting course:", error);
      toast.error(error instanceof Error ? error.message : "Couldn't delete the course.");
      setIsDeleting(false);
      setIsConfirmingDelete(false);
    }
  };

  return (
    <AppDialog open={isOpen} onOpenChange={(open) => !open && onClose()} title="Course settings">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3.5">
        <div>
          <label htmlFor="title" className={FIELD_LABEL}>Name</label>
          <input
            id="title"
            value={title}
            maxLength={100}
            required
            onChange={(e) => setTitle(e.target.value)}
            className={cn(FIELD_INPUT, "font-display text-[16px] font-semibold")}
          />
        </div>
        <div>
          <label htmlFor="description" className={FIELD_LABEL}>What members will learn</label>
          <textarea
            id="description"
            value={description}
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
            className={cn(FIELD_INPUT, "min-h-[84px] resize-y leading-[1.55]")}
          />
        </div>
        <div>
          <span className={FIELD_LABEL}>Cover</span>
          <div
            {...getRootProps()}
            className={cn(
              "flex cursor-pointer items-center gap-3.5 rounded-xl border-[1.5px] border-dashed p-3 transition-colors",
              isDragActive ? "border-brand bg-brand-soft" : "border-line-strong bg-surface-2 hover:border-brand"
            )}
          >
            <input {...getInputProps()} aria-label="Cover image" />
            <span className="grid aspect-[3/2] w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-3 text-ink-3">
              {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-5 w-5" aria-hidden="true" />}
            </span>
            <p className="min-w-0 flex-1 text-[13.5px] text-ink-2">
              {image ? image.name : cover ? "Drop a new image or click to replace the cover." : "Drop an image or click to choose one. 3:2 works best."}
            </p>
          </div>
        </div>
        <fieldset>
          <legend className={FIELD_LABEL}>Who can see it</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { value: false, title: "Private draft", text: "Only you. Keep building it." },
              { value: true, title: "Published", text: "Every member, in Classroom." },
            ].map((o) => (
              <label
                key={o.title}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors has-[input:focus-visible]:outline has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-brand",
                  isPublic === o.value ? "border-brand-line bg-brand-soft" : "border-line"
                )}
              >
                <input
                  type="radio"
                  name="visibility"
                  checked={isPublic === o.value}
                  onChange={() => setIsPublic(o.value)}
                  className="mt-[3px] accent-[rgb(var(--ds-brand))]"
                />
                <span>
                  <strong className="block text-[14px] text-ink">{o.title}</strong>
                  <small className="block text-[12.5px] text-ink-2">{o.text}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {onDeleteCourse &&
          (isConfirmingDelete ? (
            <InlineConfirm
              title="Delete course?"
              confirmLabel={isDeleting ? "Deleting…" : "Delete course"}
              cancelLabel="Keep it"
              busy={isDeleting}
              onCancel={() => setIsConfirmingDelete(false)}
              onConfirm={handleDelete}
            >
              This permanently deletes &quot;{course.title}&quot; with its chapters, lessons and videos. Members lose access and their
              progress.
            </InlineConfirm>
          ) : (
            <div className="flex items-center justify-between gap-4 border-t border-line pt-3.5">
              <div>
                <p className="text-[14px] font-semibold text-ink">Delete this course</p>
                <p className="text-[13px] text-ink-2">Removes the course and everything in it.</p>
              </div>
              <button
                type="button"
                className={cn(BTN_SECONDARY, "text-live")}
                onClick={() => setIsConfirmingDelete(true)}
                disabled={isSubmitting}
              >
                <Trash2 aria-hidden="true" />
                Delete
              </button>
            </div>
          ))}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={BTN_GHOST} onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" className={BTN_PRIMARY} disabled={isSubmitting || !title.trim()}>
            {isSubmitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </AppDialog>
  );
}
