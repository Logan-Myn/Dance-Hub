"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Crop, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { uploadFileToStorage, STORAGE_FOLDERS } from "@/lib/storage-client";
import { BannerRepositionModal } from "@/components/admin/BannerRepositionModal";

interface CustomLink {
  title: string;
  url: string;
}

type CommunityStatus = "active" | "pre_registration" | "inactive";

interface GeneralSettingsFormProps {
  communitySlug: string;
  initialName: string;
  initialDescription: string;
  initialImageUrl: string;
  initialFocalX: number;
  initialFocalY: number;
  initialZoom: number;
  initialCustomLinks: CustomLink[];
  // Passed through to the update route so we don't clobber columns this page
  // doesn't edit (the route PUTs all of them unconditionally).
  currentSlug: string;
  initialStatus: string;
  initialOpeningDate: string | null;
  canChangeOpeningDate: boolean;
}

// Port of formatUrl from CommunitySettingsModal.tsx line 165.
function formatUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `https://${url}`;
}

function normalizeStatus(status: string): CommunityStatus {
  if (status === "pre_registration" || status === "inactive") return status;
  return "active";
}

export function GeneralSettingsForm({
  communitySlug,
  initialName,
  initialDescription,
  initialImageUrl,
  initialFocalX,
  initialFocalY,
  initialZoom,
  initialCustomLinks,
  currentSlug,
  initialStatus,
  initialOpeningDate,
  canChangeOpeningDate,
}: GeneralSettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [focalX, setFocalX] = useState(initialFocalX);
  const [focalY, setFocalY] = useState(initialFocalY);
  const [zoom, setZoom] = useState(initialZoom);
  const [isRepositionOpen, setIsRepositionOpen] = useState(false);
  const [links, setLinks] = useState<CustomLink[]>(initialCustomLinks);
  const [communityStatus, setCommunityStatus] = useState<CommunityStatus>(
    normalizeStatus(initialStatus)
  );
  const [openingDate, setOpeningDate] = useState<string>(initialOpeningDate ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  function handleAddLink() {
    setLinks([...links, { title: "", url: "" }]);
  }

  function handleRemoveLink(index: number) {
    setLinks(links.filter((_, i) => i !== index));
  }

  function handleLinkChange(index: number, field: "title" | "url", value: string) {
    setLinks(
      links.map((link, i) => {
        if (i !== index) return link;
        if (field === "url") {
          return { ...link, url: formatUrl(value) };
        }
        return { ...link, [field]: value };
      })
    );
  }

  async function handleSaveChanges() {
    if (isSaving) return;

    // Validation for pre-registration (ported from CommunitySettingsModal
    // handleSaveChanges lines 647-671). Runs BEFORE the fetch + loading toast.
    if (communityStatus === "pre_registration") {
      if (!openingDate) {
        toast.error("Opening date is required for pre-registration mode");
        return;
      }

      const openingDateTime = new Date(openingDate);
      const now = new Date();

      if (openingDateTime <= now) {
        toast.error("Opening date must be in the future");
        return;
      }

      const oneMonthFromNow = new Date();
      oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

      if (openingDateTime > oneMonthFromNow) {
        const confirm = window.confirm(
          "Opening date is more than 1 month away. Are you sure you want to set this date?"
        );
        if (!confirm) return;
      }
    }

    setIsSaving(true);

    const loadingToast = toast.loading("Saving your changes...", {
      duration: Infinity,
    });

    try {
      // Regenerate slug from the name, matching the modal behaviour.
      const newSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");

      const requestBody = {
        name,
        description,
        imageUrl,
        customLinks: links,
        slug: newSlug,
        status: communityStatus,
        opening_date:
          communityStatus === "pre_registration" ? openingDate : null,
      };

      const response = await fetch(`/api/community/${communitySlug}/update`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errorData: { message?: string; error?: string } = {};
        try {
          errorData = await response.json();
        } catch {
          // Response body was not JSON.
        }
        throw new Error(
          errorData.message || errorData.error || "Failed to update community"
        );
      }

      toast.dismiss(loadingToast);
      toast.success("Your changes have been saved successfully!", {
        duration: 3000,
        icon: "✅",
      });

      // If the slug has changed, navigate to the new URL — the admin route
      // is nested under /[communitySlug], so we must redirect.
      if (newSlug !== currentSlug) {
        window.location.href = `/${newSlug}/admin/general`;
        return;
      }

      router.refresh();
    } catch (error) {
      console.error("Error saving changes:", error);
      toast.dismiss(loadingToast);
      toast.error("Failed to save changes. Please try again.", {
        duration: 3000,
        icon: "❌",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB");
      return;
    }

    setIsUploading(true);

    try {
      const publicUrl = await uploadFileToStorage(
        file,
        STORAGE_FOLDERS.COMMUNITY_IMAGES
      );

      const response = await fetch(
        `/api/community/${communitySlug}/update-image`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ imageUrl: publicUrl }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update community image");
      }

      setImageUrl(publicUrl);
      // Server resets focal/zoom on new upload — mirror that locally so the
      // preview/repositioner doesn't carry stale values from the old image.
      setFocalX(50);
      setFocalY(50);
      setZoom(1);
      toast.success("Community image updated successfully");
      router.refresh();
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error("Failed to upload image");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div id="settings-general" className="space-y-8">
      {/* Community Name + Description */}
      <div className="bg-card rounded-2xl p-6 border border-border/50 space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Community name
          </label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl border-border/50 focus:border-primary/50 focus:ring-primary/20 transition-all"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Description
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="rounded-xl border-border/50 focus:border-primary/50 focus:ring-primary/20 transition-all resize-none"
            placeholder="Tell people what your community is about..."
          />
        </div>
      </div>

      {/* Status & Availability */}
      <div className="bg-card rounded-2xl p-6 border border-border/50 space-y-4">
        <h3 className="font-display text-lg font-semibold text-foreground">
          Status & Availability
        </h3>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Community Status
          </label>
          <Select
            value={communityStatus}
            onValueChange={(value: CommunityStatus) => setCommunityStatus(value)}
          >
            <SelectTrigger className="w-full rounded-xl border-border/50">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="active">
                Active - Members can join and access content
              </SelectItem>
              <SelectItem value="pre_registration">
                Pre-Registration - Accept pre-registrations only
              </SelectItem>
              <SelectItem value="inactive">
                Inactive - Community is closed
              </SelectItem>
            </SelectContent>
          </Select>

          {communityStatus === "pre_registration" && (
            <div className="mt-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
              <p className="text-sm text-foreground">
                <strong>Pre-Registration Mode:</strong> Students can save their
                payment method now and will be automatically charged on the
                opening date.
              </p>
            </div>
          )}
        </div>

        {/* Opening Date (conditional on pre-registration status) */}
        {communityStatus === "pre_registration" && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Opening Date & Time (your local time)
            </label>
            <Input
              type="datetime-local"
              value={
                openingDate
                  ? (() => {
                      // Convert UTC to local datetime-local format
                      const date = new Date(openingDate);
                      const year = date.getFullYear();
                      const month = String(date.getMonth() + 1).padStart(2, "0");
                      const day = String(date.getDate()).padStart(2, "0");
                      const hours = String(date.getHours()).padStart(2, "0");
                      const minutes = String(date.getMinutes()).padStart(2, "0");
                      return `${year}-${month}-${day}T${hours}:${minutes}`;
                    })()
                  : ""
              }
              onChange={(e) =>
                setOpeningDate(
                  e.target.value ? new Date(e.target.value).toISOString() : ""
                )
              }
              min={(() => {
                // Get current local time for min value
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, "0");
                const day = String(now.getDate()).padStart(2, "0");
                const hours = String(now.getHours()).padStart(2, "0");
                const minutes = String(now.getMinutes()).padStart(2, "0");
                return `${year}-${month}-${day}T${hours}:${minutes}`;
              })()}
              className="rounded-xl border-border/50"
              disabled={!canChangeOpeningDate}
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Pre-registered members will be automatically charged on this date.
            </p>

            {!canChangeOpeningDate && (
              <div className="mt-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  Opening date changes are currently restricted. Contact support
                  if you need to modify the date.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cover Image */}
      <div className="bg-card rounded-2xl p-6 border border-border/50 space-y-4">
        <h3 className="font-display text-lg font-semibold text-foreground">
          Cover Image
        </h3>
        <div className="w-full max-w-2xl mx-auto space-y-3">
          {/* Preview the banner at its actual aspect (~4:1) so creators see
              what the page banner will look like, not a generic 16:9 thumbnail. */}
          <div className="relative w-full overflow-hidden rounded-2xl group bg-muted" style={{ aspectRatio: "4 / 1" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl || "/placeholder.svg"}
              alt="Community banner preview"
              className="w-full h-full object-cover"
              style={{
                objectPosition: `${focalX}% ${focalY}%`,
                transform: `scale(${zoom})`,
                transformOrigin: `${focalX}% ${focalY}%`,
              }}
            />
            <label
              htmlFor="community-image"
              className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm text-white opacity-0 group-hover:opacity-100 transition-all duration-300 cursor-pointer rounded-2xl"
            >
              {isUploading ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : (
                <span className="px-4 py-2 bg-white/20 rounded-xl backdrop-blur-sm font-medium">
                  Change Image
                </span>
              )}
            </label>
            <input
              type="file"
              id="community-image"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>
          {imageUrl && (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsRepositionOpen(true)}
                className="rounded-xl"
              >
                <Crop className="h-4 w-4 mr-2" />
                Adjust position
              </Button>
            </div>
          )}
        </div>
      </div>

      {imageUrl && (
        <BannerRepositionModal
          isOpen={isRepositionOpen}
          onClose={() => setIsRepositionOpen(false)}
          imageUrl={imageUrl}
          communitySlug={communitySlug}
          initialFocalX={focalX}
          initialFocalY={focalY}
          initialZoom={zoom}
          onSaved={(fx, fy, z) => {
            setFocalX(fx);
            setFocalY(fy);
            setZoom(z);
            router.refresh();
          }}
        />
      )}

      {/* Custom Links */}
      <div className="bg-card rounded-2xl p-6 border border-border/50 space-y-4">
        <h3 className="font-display text-lg font-semibold text-foreground">
          Custom Links
        </h3>
        <p className="text-sm text-muted-foreground">
          Add useful links for your community members (e.g., social media profiles, website)
        </p>
        <div className="space-y-3">
          {links.map((link, index) => (
            <div key={index} className="flex gap-2">
              <Input
                placeholder="Link Title (e.g., Instagram)"
                value={link.title}
                onChange={(e) => handleLinkChange(index, "title", e.target.value)}
                className="flex-1 rounded-xl border-border/50"
              />
              <Input
                placeholder="URL (e.g., instagram.com/your-profile)"
                value={link.url}
                onChange={(e) => handleLinkChange(index, "url", e.target.value)}
                className="flex-1 rounded-xl border-border/50"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleRemoveLink(index)}
                className="rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/50 transition-all"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={handleAddLink}
            className="w-full rounded-xl border-border/50 border-dashed hover:bg-primary/5 hover:border-primary/30 transition-all"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Link
          </Button>
        </div>
      </div>

      <Button
        onClick={handleSaveChanges}
        disabled={isSaving}
        className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-sm hover:shadow-md transition-all duration-200"
      >
        {isSaving ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          "Save Changes"
        )}
      </Button>
    </div>
  );
}
