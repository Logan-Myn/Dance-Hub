"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BannerCropper, type BannerCropValue } from "@/components/admin/BannerCropper";

interface BannerRepositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  communitySlug: string;
  initialFocalX: number;
  initialFocalY: number;
  initialZoom: number;
  onSaved: (focalX: number, focalY: number, zoom: number) => void;
}

export function BannerRepositionModal({
  isOpen,
  onClose,
  imageUrl,
  communitySlug,
  initialZoom,
  onSaved,
}: BannerRepositionModalProps) {
  const [value, setValue] = useState<BannerCropValue | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    if (!value) {
      onClose();
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/community/${communitySlug}/update-image-position`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value),
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save banner position");
      }
      const data = await response.json();
      onSaved(data.focalX, data.focalY, data.zoom);
      toast.success("Banner position saved");
      onClose();
    } catch (error) {
      console.error("Error saving banner position:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSaving) onClose();
      }}
    >
      <DialogContent className="p-0 overflow-hidden w-[95vw] sm:max-w-[min(95vw,1280px)]">
        <DialogHeader className="p-6 pb-3">
          <DialogTitle>Reposition banner</DialogTitle>
          <DialogDescription>
            Drag the image to choose what shows in the banner — this preview
            matches the actual banner size on the community page.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-2">
          <BannerCropper
            imageUrl={imageUrl}
            initialZoom={initialZoom}
            onChange={setValue}
          />
        </div>

        <DialogFooter className="p-6 pt-0">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save position"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
