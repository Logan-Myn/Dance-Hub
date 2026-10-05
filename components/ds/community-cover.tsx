import { cn } from "@/lib/utils";

export interface CoverSource {
  name: string;
  image_url: string | null;
  image_focal_x: number | null;
  image_focal_y: number | null;
  image_zoom: string | number | null;
}

/** A community's cover with the owner's crop, or its first letter when there is no image. */
export function CommunityCover({ community, className }: { community: CoverSource; className?: string }) {
  const focalX = community.image_focal_x ?? 50;
  const focalY = community.image_focal_y ?? 50;
  const zoom = Number(community.image_zoom ?? 1);
  return (
    <div className={cn("relative aspect-[16/9] w-full overflow-hidden bg-surface-3", className)}>
      {community.image_url ? (
        <img
          src={community.image_url}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          style={{
            objectPosition: `${focalX}% ${focalY}%`,
            transform: zoom !== 1 ? `scale(${zoom})` : undefined,
            transformOrigin: `${focalX}% ${focalY}%`,
          }}
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-brand-soft">
          <span aria-hidden="true" className="font-display text-[44px] font-semibold text-brand-ink">
            {community.name.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}
