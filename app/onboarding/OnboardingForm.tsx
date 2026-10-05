"use client";

import React, { useId, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Check, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { uploadFileToStorage, STORAGE_FOLDERS } from "@/lib/storage-client";
import { BannerCropper, type BannerCropValue } from "@/components/admin/BannerCropper";
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY } from "@/components/community-feed/feed-header";
import { FIELD_INPUT, FIELD_LABEL } from "@/components/ds/app-dialog";
import { useNameAvailability } from "@/hooks/use-name-availability";
import { communityPath } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export default function OnboardingForm() {
  const [communityName, setCommunityName] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<BannerCropValue>({ focalX: 50, focalY: 50, zoom: 1 });
  const [dragOver, setDragOver] = useState(false);
  const { user } = useAuth();
  const router = useRouter();
  const availability = useNameAvailability(communityName);
  const ids = { name: useId(), nameHelp: useId(), desc: useId(), descHelp: useId(), cover: useId() };
  const nameProblem = availability.status === "taken" || availability.status === "invalid";

  const takeFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file, like a JPG or PNG.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Choose an image under 5 MB.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setCrop({ focalX: 50, focalY: 50, zoom: 1 });
  };

  const removeImage = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImageFile(null);
    setPreviewUrl(null);
    setCrop({ focalX: 50, focalY: 50, zoom: 1 });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isLoading) return;
    if (nameProblem) {
      document.getElementById(ids.name)?.focus();
      return;
    }

    setIsLoading(true);
    try {
      let imageUrl = "";
      if (imageFile) {
        setIsUploading(true);
        try {
          imageUrl = await uploadFileToStorage(imageFile, STORAGE_FOLDERS.COMMUNITY_IMAGES);
        } finally {
          setIsUploading(false);
        }
      }

      // The server checks the name and address again, so a name taken a
      // moment ago is still refused with its reason.
      const response = await fetch("/api/community/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: communityName,
          description,
          imageUrl,
          createdBy: user.id,
          ...(imageUrl ? { focalX: crop.focalX, focalY: crop.focalY, zoom: crop.zoom } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't create the community. Try again.");

      if (data.warning) console.warn(data.warning);
      toast.success("Community created");
      router.push(communityPath(data.slug));
    } catch (error) {
      console.error("Error:", error);
      toast.error(error instanceof Error ? error.message : "Couldn't create the community. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const fileInput = (
    <input
      id={ids.cover}
      type="file"
      accept="image/*"
      className="sr-only"
      disabled={isUploading || isLoading}
      onChange={(e) => {
        takeFile(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <label htmlFor={ids.name} className={FIELD_LABEL}>
          Community name
        </label>
        <input
          id={ids.name}
          type="text"
          value={communityName}
          onChange={(e) => setCommunityName(e.target.value)}
          placeholder="For example: Bachata with Maria"
          maxLength={80}
          required
          autoComplete="off"
          aria-invalid={nameProblem || undefined}
          aria-describedby={ids.nameHelp}
          className={FIELD_INPUT}
        />
        <p id={ids.nameHelp} aria-live="polite" className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          {availability.slug && (
            <span className="text-ink-3">
              Your address: <span className="font-medium text-ink-2">dance-hub.io/{availability.slug}</span>
            </span>
          )}
          {availability.status === "checking" && <span className="text-ink-3">Checking…</span>}
          {availability.status === "available" && (
            <span className="inline-flex items-center gap-1 font-semibold text-ok">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Available
            </span>
          )}
          {(availability.status === "taken" || availability.status === "invalid") && (
            <span className="font-medium text-live">{availability.message}</span>
          )}
          {availability.status === "idle" && <span className="text-ink-3">At least 3 characters. You can change it later.</span>}
        </p>
      </div>

      <div>
        <label htmlFor={ids.desc} className={FIELD_LABEL}>
          Description
        </label>
        <textarea
          id={ids.desc}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One or two sentences: what you teach and who it's for."
          required
          rows={3}
          aria-describedby={ids.descHelp}
          className={cn(FIELD_INPUT, "resize-y")}
        />
        <p id={ids.descHelp} className="mt-1.5 text-[13px] text-ink-3">
          Shown under your name on the community and About pages.
        </p>
      </div>

      <div>
        <p className={FIELD_LABEL}>
          Cover image <span className="font-normal text-ink-3">optional</span>
        </p>
        {previewUrl && imageFile ? (
          <div className="flex flex-col gap-2.5">
            <BannerCropper key={previewUrl} imageUrl={previewUrl} onChange={setCrop} />
            <p className="text-[13px] text-ink-3">Drag and zoom to choose what shows in the banner.</p>
            <div className="flex flex-wrap gap-2">
              <label htmlFor={ids.cover} className={cn(BTN_SECONDARY, "h-9 cursor-pointer")}>
                <ImagePlus aria-hidden="true" />
                Replace image
                {fileInput}
              </label>
              <button type="button" onClick={removeImage} className={cn(BTN_GHOST, "h-9")}>
                <Trash2 aria-hidden="true" />
                Remove
              </button>
            </div>
          </div>
        ) : (
          <label
            htmlFor={ids.cover}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              takeFile(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-[1.5px] border-dashed px-5 py-7 text-center transition-colors",
              dragOver ? "border-brand bg-brand-soft" : "border-line-strong bg-surface-2 hover:border-brand-line hover:bg-brand-soft"
            )}
          >
            <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-xl bg-surface text-brand-ink shadow-card">
              <ImagePlus className="h-5 w-5" />
            </span>
            <span className="text-[14.5px] text-ink">
              <span className="font-semibold text-brand-ink">Choose an image</span> or drop it here
            </span>
            <span className="text-[12.5px] text-ink-3">JPG, PNG or GIF up to 5 MB. Wide images work best, around 1600 by 400.</span>
            {fileInput}
          </label>
        )}
      </div>

      <button type="submit" disabled={isLoading || isUploading || nameProblem} className={cn(BTN_PRIMARY, "mt-1 h-11 w-full text-[15px]")}>
        {isLoading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Creating your community…
          </>
        ) : (
          "Create community"
        )}
      </button>
    </form>
  );
}
