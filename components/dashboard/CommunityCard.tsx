"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";

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

export function CommunityCard({ community, isAdmin }: CommunityCardProps) {
  const focalX = community.image_focal_x ?? 50;
  const focalY = community.image_focal_y ?? 50;
  const zoom = Number(community.image_zoom ?? 1);

  return (
    <Link
      href={`/${community.slug}`}
      className="group block rounded-2xl bg-card border border-border/50 overflow-hidden shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/50"
    >
      <div className="relative w-full aspect-[16/9] bg-muted overflow-hidden">
        {/* Inner wrapper carries the hover zoom so it composes with the
            focal scale applied inline on the <img> (two nested transforms
            multiply rather than overwrite each other). */}
        <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-105">
          {community.image_url ? (
            <img
              src={community.image_url}
              alt={community.name}
              className="w-full h-full object-cover"
              style={{
                objectPosition: `${focalX}% ${focalY}%`,
                transform: `scale(${zoom})`,
                transformOrigin: `${focalX}% ${focalY}%`,
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/80 to-accent">
              <span className="font-display text-5xl font-semibold text-white">
                {community.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 space-y-1">
        <h3 className="font-display text-lg font-semibold text-foreground line-clamp-1">
          {community.name}
        </h3>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            {community.members_count} {community.members_count === 1 ? "member" : "members"}
          </span>
          {isAdmin && (
            <>
              <span aria-hidden>·</span>
              <Badge variant="secondary" className="font-normal text-xs px-1.5 py-0">
                Admin
              </Badge>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
