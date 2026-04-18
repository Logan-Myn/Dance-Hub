"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { uploadFileToStorage, STORAGE_FOLDERS } from "@/lib/storage-client";

interface CustomLink {
  title: string;
  url: string;
}

interface GeneralSettingsFormProps {
  communitySlug: string;
  initialName: string;
  initialDescription: string;
  initialImageUrl: string;
  initialCustomLinks: CustomLink[];
  // Passed through to the update route so we don't clobber columns this page
  // doesn't edit (the route PUTs all of them unconditionally).
  currentSlug: string;
  currentStatus: string;
  currentOpeningDate: string | null;
}

// Port of formatUrl from CommunitySettingsModal.tsx line 165.
function formatUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `https://${url}`;
}

export function GeneralSettingsForm({
  communitySlug,
  initialName,
  initialDescription,
  initialImageUrl,
  initialCustomLinks,
  currentSlug,
  currentStatus,
  currentOpeningDate,
}: GeneralSettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [links, setLinks] = useState<CustomLink[]>(initialCustomLinks);
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

      // The update route PUTs every column unconditionally (slug, status,
      // opening_date, image_url) — pass the current values through so this
      // form only mutates name/description/customLinks and leaves the rest
      // alone.
      const requestBody = {
        name,
        description,
        imageUrl,
        customLinks: links,
        slug: newSlug,
        status: currentStatus,
        opening_date: currentOpeningDate,
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

      {/* Cover Image */}
      <div className="bg-card rounded-2xl p-6 border border-border/50 space-y-4">
        <h3 className="font-display text-lg font-semibold text-foreground">
          Cover Image
        </h3>
        <div className="w-full max-w-md mx-auto">
          <div className="relative aspect-video overflow-hidden rounded-2xl group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl || "/placeholder.svg"}
              alt="Community preview"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
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
        </div>
      </div>

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
