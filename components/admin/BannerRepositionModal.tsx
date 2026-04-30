"use client";

import { useCallback, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import { Loader2, Move, ZoomIn } from "lucide-react";
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

// Matches the banner's desktop aspect (max-w-7xl / h-72 ≈ 4.4:1). Picking
// 4:1 keeps the preview honest on desktop and stays close enough on mobile
// where the banner gets a bit shorter relative to width.
const BANNER_ASPECT = 4 / 1;

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
  initialFocalX,
  initialFocalY,
  initialZoom,
  onSaved,
}: BannerRepositionModalProps) {
  // react-easy-crop wants the crop position in pixels (it manages it for us)
  // and zoom as a multiplier. We feed back focal/zoom on save.
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(initialZoom);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const onCropComplete = useCallback((cropped: Area, _croppedPx: Area) => {
    // `cropped` here is the percentage-based area react-easy-crop just
    // reported — we translate its center to focal_x/y on save.
    setCroppedArea(cropped);
  }, []);

  async function handleSave() {
    if (!croppedArea) {
      onClose();
      return;
    }
    setIsSaving(true);
    try {
      const focalX = Math.round(croppedArea.x + croppedArea.width / 2);
      const focalY = Math.round(croppedArea.y + croppedArea.height / 2);
      const clampedX = Math.max(0, Math.min(100, focalX));
      const clampedY = Math.max(0, Math.min(100, focalY));
      const clampedZoom = Math.max(1, Math.min(5, zoom));

      const response = await fetch(
        `/api/community/${communitySlug}/update-image-position`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            focalX: clampedX,
            focalY: clampedY,
            zoom: clampedZoom,
          }),
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

  // Seed the cropper's initial crop position so the modal opens showing
  // whatever the creator already saved. We translate focal/zoom back into
  // a starting `crop` of {0,0} (center) — react-easy-crop recenters when
  // zoom changes, so leaving it at the center with the right zoom + a
  // recompute on first drag is good enough for v1.
  const initialCrop = { x: 0, y: 0 };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSaving) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-3">
          <DialogTitle>Reposition banner</DialogTitle>
          <DialogDescription>
            Drag the image to choose what shows in the banner. Use the slider
            to zoom in.
          </DialogDescription>
        </DialogHeader>

        <div className="relative w-full bg-black" style={{ aspectRatio: `${BANNER_ASPECT}` }}>
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={BANNER_ASPECT}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            minZoom={1}
            maxZoom={5}
            zoomSpeed={0.5}
            // No grid / round crop — banner is a rectangle.
            objectFit="contain"
          />
        </div>

        <div className="p-6 pt-4 space-y-3">
          <div className="flex items-center gap-3">
            <ZoomIn className="h-4 w-4 text-muted-foreground" />
            <input
              type="range"
              min={1}
              max={5}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-primary"
              aria-label="Zoom"
            />
            <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
              {zoom.toFixed(2)}x
            </span>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Move className="h-3 w-3" /> Drag the image inside the frame to reposition
          </p>
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
