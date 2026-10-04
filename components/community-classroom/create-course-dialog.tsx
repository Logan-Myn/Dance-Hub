"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { ImagePlus } from "lucide-react";
import toast from "react-hot-toast";
import { AppDialog, FIELD_ERROR, FIELD_INPUT, FIELD_LABEL } from "@/components/ds/app-dialog";
import { BTN_GHOST, BTN_PRIMARY } from "@/components/community-feed/feed-header";
import { cn } from "@/lib/utils";

const MAX_BYTES = 5 * 1024 * 1024;

/** Name, description and cover. New courses start as a private draft. */
export function CreateCourseDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: { title: string; description: string; image: File | null }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Fixed ids: only one course dialog is open at a time (e2e uses #title).
  const ids = { title: "title", desc: "description", err: useId() };

  const preview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const onDrop = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("Choose an image under 5 MB.");
      return;
    }
    setImage(file);
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpeg", ".jpg", ".png", ".gif", ".webp"] },
    maxSize: MAX_BYTES,
    multiple: false,
  });

  const reset = () => {
    setTitle("");
    setDescription("");
    setImage(null);
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give the course a name members will recognize.");
      return;
    }
    setBusy(true);
    try {
      await onCreate({ title: title.trim(), description: description.trim(), image });
      reset();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Create a course"
      description="It starts as a private draft. Publish it from Course settings when it's ready."
    >
      <form id="create-course-form" onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <div>
          <label htmlFor={ids.title} className={FIELD_LABEL}>Name</label>
          <input
            id={ids.title}
            value={title}
            maxLength={100}
            autoComplete="off"
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Bachata A1"
            aria-invalid={!!error}
            aria-describedby={error ? ids.err : undefined}
            className={cn(FIELD_INPUT, "font-display text-[16px] font-semibold")}
          />
          {error && <p id={ids.err} className={FIELD_ERROR}>{error}</p>}
        </div>
        <div>
          <label htmlFor={ids.desc} className={FIELD_LABEL}>What members will learn</label>
          <textarea
            id={ids.desc}
            value={description}
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="The basic step, turns and your first combination."
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
              {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-5 w-5" aria-hidden="true" />}
            </span>
            <p className="min-w-0 flex-1 text-[13.5px] text-ink-2">
              {image ? image.name : "Drop an image or click to choose one. 3:2 works best, up to 5 MB."}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={BTN_GHOST} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" className={BTN_PRIMARY} disabled={busy}>
            {busy ? "Creating…" : "Create course"}
          </button>
        </div>
      </form>
    </AppDialog>
  );
}
