"use client";

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Heart, MessageSquare, Pin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { CATEGORY_ICONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "react-hot-toast";

interface ThreadCardFluidProps {
  id: string;
  title: string;
  content: string;
  author: {
    name: string;
    image: string;
  };
  created_at: string;
  likes_count: number;
  comments_count: number;
  category?: string;
  category_type?: string;
  likes?: string[];
  pinned?: boolean;
  onClick: () => void;
  onLikeUpdate?: (
    threadId: string,
    newLikesCount: number,
    liked: boolean
  ) => void;
}

export default function ThreadCardFluid({
  id,
  title,
  content,
  author,
  created_at,
  likes_count,
  comments_count,
  category,
  category_type,
  likes = [],
  pinned = false,
  onClick,
  onLikeUpdate,
}: ThreadCardFluidProps) {
  const { user, session } = useAuth();
  const [isLiking, setIsLiking] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [localLikes, setLocalLikes] = useState<string[]>(likes || []);
  const [localLikesCount, setLocalLikesCount] = useState(likes_count || 0);
  const isLiked = user ? localLikes.includes(user.id) : false;

  const iconConfig = CATEGORY_ICONS.find((i) => i.label === category_type);
  const IconComponent = iconConfig?.icon || null;

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!user) {
      toast.error("Please sign in to like threads");
      return;
    }

    if (isLiking) return;

    setIsLiking(true);

    // Optimistic update
    const wasLiked = localLikes.includes(user.id);
    const newLikes = wasLiked
      ? localLikes.filter(likeId => likeId !== user.id)
      : [...localLikes, user.id];
    const newLikesCount = wasLiked ? localLikesCount - 1 : localLikesCount + 1;

    setLocalLikes(newLikes);
    setLocalLikesCount(newLikesCount);

    try {
      if (!session) {
        throw new Error("No active session");
      }

      const response = await fetch(`/api/threads/${id}/like`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: user.id }),
      });

      if (!response.ok) {
        // Revert on error
        setLocalLikes(wasLiked ? [...localLikes, user.id] : localLikes.filter(likeId => likeId !== user.id));
        setLocalLikesCount(wasLiked ? localLikesCount + 1 : localLikesCount - 1);
        const error = await response.text();
        throw new Error(error || "Failed to like thread");
      }

      const data = await response.json();
      setLocalLikesCount(data.likesCount);
      onLikeUpdate?.(id, data.likesCount, data.liked);
    } catch (error) {
      console.error("Error liking thread:", error);
      toast.error("Failed to like thread. Please try again.");
    } finally {
      setIsLiking(false);
    }
  };

  return (
    <article
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "group relative bg-card rounded-2xl p-4 sm:p-5 cursor-pointer",
        "border-2 border-transparent",
        "transition-all duration-300 ease-out",
        "hover:shadow-lg hover:border-primary/20",
        "hover:-translate-y-0.5 hover:rotate-[-0.3deg]",
        pinned && "ring-2 ring-primary/30 bg-primary/5"
      )}
    >
      {/* Pinned indicator */}
      {pinned && (
        <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground rounded-full p-1.5 shadow-md">
          <Pin className="h-3.5 w-3.5" />
        </div>
      )}

      {/* Accent border that slides in on hover */}
      <div
        className={cn(
          "absolute left-0 top-4 bottom-4 w-1 rounded-full bg-primary",
          "transition-all duration-300 ease-out",
          isHovered ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"
        )}
      />

      {/* Author row */}
      <div className="flex items-center gap-3 mb-3">
        <Avatar className="h-9 w-9 ring-2 ring-border/50">
          <AvatarImage src={author.image} alt={author.name} />
          <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
            {author.name?.[0]?.toUpperCase() || "U"}
          </AvatarFallback>
        </Avatar>

        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-sm">
          <span className="font-semibold text-foreground">{author.name}</span>
          <span className="text-muted-foreground">posted in</span>
          {IconComponent && (
            <div className="flex items-center gap-1">
              <IconComponent
                className="h-3.5 w-3.5"
                style={{ color: iconConfig?.color }}
              />
              <span
                className="font-medium"
                style={{ color: iconConfig?.color }}
              >
                {category || "General"}
              </span>
            </div>
          )}
          {!IconComponent && (
            <span className="font-medium text-muted-foreground">
              {category || "General"}
            </span>
          )}
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            {formatDistanceToNow(new Date(created_at))} ago
          </span>
        </div>
      </div>

      {/* Title */}
      <h2 className="font-display text-lg md:text-xl font-semibold text-foreground mb-2 group-hover:text-primary transition-colors duration-200">
        {title}
      </h2>

      {/* Content preview */}
      <div
        className="prose prose-sm max-w-none text-muted-foreground line-clamp-3 mb-4"
        dangerouslySetInnerHTML={{ __html: content }}
      />

      {/* Interaction buttons */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleLike}
          disabled={isLiking || !user}
          className={cn(
            "flex items-center gap-1.5 text-sm font-medium min-h-[44px]",
            "transition-all duration-200",
            "rounded-full px-3 py-1.5 -ml-3",
            "hover:bg-primary/10",
            isLiked
              ? "text-pink-500"
              : "text-muted-foreground hover:text-pink-500"
          )}
        >
          <Heart
            className={cn(
              "h-4 w-4",
              isLiked && "fill-current",
              isLiking && "animate-pulse scale-110"
            )}
          />
          <span>{localLikesCount}</span>
        </button>

        <button
          className={cn(
            "flex items-center gap-1.5 text-sm font-medium text-muted-foreground min-h-[44px]",
            "transition-all duration-200",
            "rounded-full px-3 py-1.5",
            "hover:bg-primary/10 hover:text-primary"
          )}
        >
          <MessageSquare className="h-4 w-4" />
          <span>{comments_count}</span>
        </button>
      </div>
    </article>
  );
}
