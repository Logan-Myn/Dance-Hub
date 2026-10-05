"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Copy, Crop, ImagePlus, Loader2, Plus, X } from "lucide-react";
import { BTN_GHOST, BTN_SECONDARY } from "@/components/community-feed/feed-header";
import { Card, Screen, ScreenHead } from "@/components/community-admin/ui";
import { FIELD_INPUT, FIELD_LABEL } from "@/components/ds/app-dialog";
import { SaveBar } from "@/components/ds/save-bar";
import { cn } from "@/lib/utils";
import { uploadFileToStorage, STORAGE_FOLDERS } from "@/lib/storage-client";
import { BannerRepositionModal } from "@/components/admin/BannerRepositionModal";
import { communityPath } from "@/lib/safe-redirect";
import { checkCommunitySlug } from "@/lib/community-slug";
import {
  OPENING_DATE_LOCKED_MESSAGE,
  PRE_REGISTRATIONS_LOCK_MESSAGE,
} from "@/lib/community-status";

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
  /** Someone has pre-registered: status and opening date are frozen. */
  hasPreRegistrations?: boolean;
}

// Port of formatUrl from CommunitySettingsModal.tsx line 165.
function formatUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `https://${url}`;
}

// Opening dates arrive in different string forms; compare the moment, not the text.
function sameInstant(a: string | null, b: string | null): boolean {
  const t = (d: string | null) => (d ? new Date(d).getTime() : null);
  return t(a) === t(b);
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
  hasPreRegistrations = false,
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

    // The update route writes name and slug unconditionally, so saving a blank
    // name moves the community to the site root and makes it unreachable.
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Enter a community name.");
      return;
    }
    // Same slug rule the server applies (letters/digits, not a reserved path).
    const slugCheck = checkCommunitySlug(trimmedName);
    if (!slugCheck.ok) {
      toast.error(slugCheck.error);
      return;
    }

    // Validation for pre-registration (ported from CommunitySettingsModal
    // handleSaveChanges lines 647-671). Runs BEFORE the fetch + loading toast,
    // and only when the status or date changes (the server keeps an unchanged
    // date as it is, even once it has passed).
    const instant = (d: string | null) => (d ? new Date(d).getTime() : null);
    const statusOrDateChanged =
      communityStatus !== normalizeStatus(initialStatus) ||
      instant(openingDate || null) !== instant(initialOpeningDate);
    if (communityStatus === "pre_registration" && statusOrDateChanged) {
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

    const loadingToast = toast.loading("Saving…", { duration: Infinity });

    try {
      // Regenerate slug from the name, matching the modal behaviour.
      const newSlug = slugCheck.slug;

      const requestBody = {
        name: trimmedName,
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

      const result: { data?: { slug?: string } } = await response
        .json()
        .catch(() => ({}));
      const savedSlug = result.data?.slug || newSlug;

      toast.dismiss(loadingToast);
      toast.success("Changes saved");
      // The stored name is trimmed; match it so the save bar clears.
      setName(trimmedName);

      // If the slug has changed, navigate to the new URL — the admin route
      // is nested under /[communitySlug], so we must redirect.
      if (savedSlug !== currentSlug) {
        window.location.href = communityPath(savedSlug, '/admin/general');
        return;
      }

      router.refresh();
    } catch (error) {
      console.error("Error saving changes:", error);
      toast.dismiss(loadingToast);
      // Show the server's reason (locked date, reserved name...) when it gave one.
      toast.error(
        error instanceof Error && error.message !== "Failed to update community"
          ? error.message
          : "Couldn't save your changes. Try again.",
        { duration: 6000 }
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Choose an image under 5 MB.");
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
      toast.success("Cover image updated");
      router.refresh();
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error("Couldn't upload the image. Try again.");
    } finally {
      setIsUploading(false);
    }
  }

  const dirty =
    name !== initialName ||
    description !== initialDescription ||
    JSON.stringify(links) !== JSON.stringify(initialCustomLinks) ||
    communityStatus !== normalizeStatus(initialStatus) ||
    sameInstant(openingDate || null, initialOpeningDate) === false;

  function discard() {
    setName(initialName);
    setDescription(initialDescription);
    setLinks(initialCustomLinks);
    setCommunityStatus(normalizeStatus(initialStatus));
    setOpeningDate(initialOpeningDate ?? "");
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${communityPath(currentSlug)}`);
      toast.success("Address copied");
    } catch {
      toast.error("Couldn't copy. Your browser blocked it.");
    }
  }

  const localValue = (iso: string) => {
    const date = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  return (
    <Screen>
      <ScreenHead title="Community details" sub="Your name, description, cover and links. Visitors see them on your About page." />
      <div id="settings-general" className="flex flex-col gap-5">
        <Card as="section" aria-labelledby="id-h" className="flex flex-col gap-3.5 p-5">
          <h2 id="id-h" className="font-display text-[17px] font-semibold text-ink">
            Name and description
          </h2>
          <div>
            <label htmlFor="cd-name" className={FIELD_LABEL}>
              Community name
            </label>
            <input id="cd-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={FIELD_INPUT} />
          </div>
          <div>
            <p className={FIELD_LABEL}>Web address</p>
            <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-[14.5px] text-ink-2">
              <span className="min-w-0 flex-1 truncate">dance-hub.io{communityPath(currentSlug)}</span>
              <button type="button" onClick={copyAddress} aria-label="Copy address" className="grid h-7 w-7 place-items-center rounded-md text-ink-3 hover:bg-surface hover:text-ink">
                <Copy className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-1.5 text-[12.5px] text-ink-3">It follows the name. Changing the name changes the address, and old links stop working.</p>
          </div>
          <div>
            <label htmlFor="cd-desc" className={FIELD_LABEL}>
              Description
            </label>
            <textarea
              id="cd-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="One or two sentences: what you teach and who it's for."
              className={cn(FIELD_INPUT, "resize-y")}
            />
            <p className="mt-1.5 text-[12.5px] tabular-nums text-ink-3">
              Shown under your name on the community and About pages. {description.length} characters.
            </p>
          </div>
        </Card>

        <Card as="section" aria-labelledby="cov-h" className="flex flex-col gap-3.5 p-5">
          <div>
            <h2 id="cov-h" className="font-display text-[17px] font-semibold text-ink">
              Cover image
            </h2>
            <p className="mt-0.5 text-[13.5px] text-ink-2">A wide image works best, 1600 by 400 pixels. Choose what shows with Adjust position.</p>
          </div>
          <div className="relative w-full overflow-hidden rounded-2xl bg-surface-3" style={{ aspectRatio: "4 / 1" }}>
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Cover preview"
                className="h-full w-full object-cover"
                style={{
                  objectPosition: `${focalX}% ${focalY}%`,
                  transform: `scale(${zoom})`,
                  transformOrigin: `${focalX}% ${focalY}%`,
                }}
              />
            ) : (
              <span className="grid h-full place-items-center text-[14px] text-ink-3">No cover image yet</span>
            )}
            {isUploading && (
              <span className="absolute inset-0 grid place-items-center bg-black/40 text-white">
                <Loader2 className="h-7 w-7 animate-spin" aria-label="Uploading" />
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <label className={cn(BTN_SECONDARY, "h-9 cursor-pointer")}>
              <ImagePlus aria-hidden="true" />
              {imageUrl ? "Replace image" : "Upload an image"}
              <input type="file" id="community-image" accept="image/*" onChange={handleImageUpload} disabled={isUploading} className="sr-only" />
            </label>
            {imageUrl && (
              <button type="button" onClick={() => setIsRepositionOpen(true)} className={cn(BTN_GHOST, "h-9")}>
                <Crop aria-hidden="true" />
                Adjust position
              </button>
            )}
          </div>
        </Card>

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

        <Card as="section" aria-labelledby="ln-h" className="flex flex-col gap-3 p-5">
          <div>
            <h2 id="ln-h" className="font-display text-[17px] font-semibold text-ink">
              Links
            </h2>
            <p className="mt-0.5 text-[13.5px] text-ink-2">Your website or social profiles. An Instagram link shows on your community and About pages.</p>
          </div>
          {links.map((link, index) => (
            <div key={index} className="flex flex-wrap gap-2 sm:flex-nowrap">
              <input
                placeholder="Title, for example Instagram"
                aria-label={`Link ${index + 1} title`}
                value={link.title}
                onChange={(e) => handleLinkChange(index, "title", e.target.value)}
                className={cn(FIELD_INPUT, "sm:max-w-[220px]")}
              />
              <input
                placeholder="instagram.com/your-profile"
                aria-label={`Link ${index + 1} address`}
                value={link.url}
                onChange={(e) => handleLinkChange(index, "url", e.target.value)}
                className={FIELD_INPUT}
              />
              <button
                type="button"
                onClick={() => handleRemoveLink(index)}
                aria-label={`Remove ${link.title || "link"}`}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-ink-3 hover:bg-live-soft hover:text-live"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          <button type="button" onClick={handleAddLink} className={cn(BTN_GHOST, "h-9 self-start")}>
            <Plus aria-hidden="true" />
            Add a link
          </button>
        </Card>

        <Card as="section" aria-labelledby="st-h" className="flex flex-col gap-3.5 p-5">
          <div>
            <h2 id="st-h" className="font-display text-[17px] font-semibold text-ink">
              Who can join
            </h2>
            <p className="mt-0.5 text-[13.5px] text-ink-2">Open now, take pre-registrations before you open, or close to new members.</p>
          </div>
          <div>
            <label htmlFor="cd-status" className={FIELD_LABEL}>
              Status
            </label>
            <select
              id="cd-status"
              value={communityStatus}
              onChange={(e) => setCommunityStatus(e.target.value as CommunityStatus)}
              disabled={hasPreRegistrations}
              className={cn(FIELD_INPUT, "h-10 py-0")}
            >
              <option value="active">Open: members can join</option>
              <option value="pre_registration">Pre-registration: members sign up now, pay on opening day</option>
              <option value="inactive">Closed to new members</option>
            </select>
            {hasPreRegistrations && <p className="mt-2 rounded-[10px] bg-warn-soft px-3 py-2.5 text-[13.5px] text-warn">{PRE_REGISTRATIONS_LOCK_MESSAGE}</p>}
          </div>
          {communityStatus === "pre_registration" && (
            <div>
              <label htmlFor="cd-open" className={FIELD_LABEL}>
                Opening date and time, your local time
              </label>
              <input
                id="cd-open"
                type="datetime-local"
                value={openingDate ? localValue(openingDate) : ""}
                onChange={(e) => setOpeningDate(e.target.value ? new Date(e.target.value).toISOString() : "")}
                disabled={!canChangeOpeningDate || hasPreRegistrations}
                className={cn(FIELD_INPUT, "max-w-[280px]")}
              />
              <p className="mt-1.5 text-[12.5px] text-ink-3">Members who pre-register are charged on this date.</p>
              {!canChangeOpeningDate && !hasPreRegistrations && (
                <p className="mt-2 rounded-[10px] bg-warn-soft px-3 py-2.5 text-[13.5px] text-warn">{OPENING_DATE_LOCKED_MESSAGE}</p>
              )}
            </div>
          )}
        </Card>
      </div>
      <SaveBar show={dirty} saving={isSaving} onSave={handleSaveChanges} onDiscard={discard} />
    </Screen>
  );
}
