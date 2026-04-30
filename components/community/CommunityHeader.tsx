"use client";

import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Users, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface Member {
  id: string;
  user_id: string;
  profile?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    display_name: string | null;
  };
}

interface CommunityHeaderProps {
  name: string;
  description: string;
  imageUrl: string;
  membersCount: number;
  members: Member[];
  isCreator: boolean;
  onManageClick: () => void;
}

export default function CommunityHeader({
  name,
  description,
  imageUrl,
  membersCount,
  members,
  isCreator,
  onManageClick,
}: CommunityHeaderProps) {
  const displayMembers = members.slice(0, 5);
  const remainingCount = Math.max(0, membersCount - 5);

  return (
    <div id="community-header" className="relative mb-8">
      {/* Background with gradient overlay */}
      <div className="relative h-56 sm:h-64 md:h-72 overflow-hidden rounded-3xl bg-muted">
        {/* Blurred backdrop fills the banner with the image's own colors so
            portrait/square uploads don't get awkwardly cropped. */}
        <Image
          src={imageUrl || "/placeholder.svg"}
          alt=""
          aria-hidden
          fill
          sizes="100vw"
          className="object-cover scale-110 blur-2xl opacity-80"
        />
        <div className="absolute inset-0 bg-black/25" />
        {/* The actual image, shown intact (no crop) over the blurred bg. */}
        <Image
          src={imageUrl || "/placeholder.svg"}
          alt={name}
          fill
          priority
          sizes="100vw"
          className="object-contain"
        />
        {/* Subtle dark gradient at bottom for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Content */}
        <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-6 md:p-8">
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-semibold text-white mb-2 drop-shadow-lg">
            {name}
          </h1>
          <p className="text-white/90 text-sm md:text-base max-w-2xl mb-4 line-clamp-2">
            {description}
          </p>

          {/* Members and actions row */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              {/* Member avatars */}
              <div className="flex items-center">
                <div className="flex -space-x-2">
                  {displayMembers.map((member, index) => (
                    <Avatar
                      key={member.id}
                      className={cn(
                        "h-8 w-8 border-2 border-white ring-0 transition-transform hover:scale-110 hover:z-10",
                        index === 0 && "z-5",
                        index === 1 && "z-4",
                        index === 2 && "z-3",
                        index === 3 && "z-2",
                        index === 4 && "z-1"
                      )}
                    >
                      <AvatarImage
                        src={member.profile?.avatar_url || ""}
                        alt={member.profile?.full_name || "Member"}
                      />
                      <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                        {(member.profile?.display_name?.[0] ||
                          member.profile?.full_name?.[0] ||
                          "U"
                        ).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
                {remainingCount > 0 && (
                  <span className="ml-2 text-white/90 text-sm font-medium">
                    +{remainingCount}
                  </span>
                )}
              </div>

              {/* Members count */}
              <div id="member-count" className="flex items-center gap-1.5 text-white/90">
                <Users className="h-4 w-4" />
                <span className="text-sm font-medium">{membersCount} members</span>
              </div>
            </div>

            {/* Manage button */}
            {isCreator && (
              <Button
                id="manage-community-button"
                onClick={onManageClick}
                variant="secondary"
                className="bg-white/20 hover:bg-white/30 text-white border-white/30 backdrop-blur-sm"
              >
                <Settings className="h-4 w-4 mr-2" />
                Manage Community
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Curved bottom edge */}
      <div className="absolute -bottom-1 left-0 right-0 overflow-hidden">
        <svg
          viewBox="0 0 1200 60"
          preserveAspectRatio="none"
          className="w-full h-8 md:h-12"
          fill="hsl(var(--background))"
        >
          <path d="M0,60 L0,30 Q600,0 1200,30 L1200,60 Z" />
        </svg>
      </div>
    </div>
  );
}
