"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { Pill } from "@/components/ds/pill";
import { communityPath } from "@/lib/safe-redirect";

interface CommunityCardProps {
  community: {
    slug: string;
    name: string;
    image_url: string | null;
    image_focal_x: number | null;
    image_focal_y: number | null;
    image_zoom: string | number | null;
    members_count: number;
  };
  isAdmin: boolean;
}

/** A community the viewer belongs to (or owns). The whole card opens it. */
export function CommunityCard({ community, isAdmin }: CommunityCardProps) {
  const focalX = community.image_focal_x ?? 50;
  const focalY = community.image_focal_y ?? 50;
  const zoom = Number(community.image_zoom ?? 1);
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-[box-shadow,border-color,transform] hover:-translate-y-px hover:border-line-strong hover:shadow-raised has-[a.card-link:focus-visible]:outline has-[a.card-link:focus-visible]:outline-2 has-[a.card-link:focus-visible]:outline-offset-2 has-[a.card-link:focus-visible]:outline-brand">
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-3">
        {community.image_url ? (
          <img
            src={community.image_url}
            alt=""
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
      <div className="flex items-start gap-2 p-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[17px] font-semibold text-ink">
            <Link
              href={communityPath(community.slug)}
              className="card-link outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-brand-ink"
            >
              {community.name}
            </Link>
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13.5px] text-ink-2">
            {community.members_count} {community.members_count === 1 ? "member" : "members"}
            {isAdmin && <Pill variant="brand">Owner</Pill>}
          </p>
        </div>
        {isAdmin && (
          <Link
            href={communityPath(community.slug, "/admin")}
            aria-label={`Admin for ${community.name}`}
            title="Admin"
            className="relative z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    </article>
  );
}
