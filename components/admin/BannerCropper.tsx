"use client";

import { useCallback, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import { Move, ZoomIn } from "lucide-react";

// Matches the banner's desktop aspect (max-w-7xl / h-72 ≈ 4.4:1). Picking
// 4:1 keeps the preview honest on desktop and stays close enough on mobile
// where the banner gets a bit shorter relative to width.
export const BANNER_ASPECT = 4 / 1;

export interface BannerCropValue {
  focalX: number;
  focalY: number;
  zoom: number;
}

interface BannerCropperProps {
  imageUrl: string;
  initialZoom?: number;
  onChange?: (value: BannerCropValue) => void;
  className?: string;
}

export function BannerCropper({
  imageUrl,
  initialZoom = 1,
  onChange,
  className,
}: BannerCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(initialZoom);

  const onCropComplete = useCallback(
    (cropped: Area) => {
      const focalX = Math.round(cropped.x + cropped.width / 2);
      const focalY = Math.round(cropped.y + cropped.height / 2);
      const clampedX = Math.max(0, Math.min(100, focalX));
      const clampedY = Math.max(0, Math.min(100, focalY));
      const clampedZoom = Math.max(1, Math.min(5, zoom));
      onChange?.({ focalX: clampedX, focalY: clampedY, zoom: clampedZoom });
    },
    [onChange, zoom]
  );

  return (
    <div className={className}>
      <div
        className="relative w-full bg-black rounded-md overflow-hidden"
        style={{ aspectRatio: `${BANNER_ASPECT}` }}
      >
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
          objectFit="cover"
        />
      </div>

      <div className="pt-3 space-y-3">
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
    </div>
  );
}
