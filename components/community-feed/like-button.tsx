"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

/** Heart toggle with an optimistic count; reports the server's answer. */
export function LikeButton({
  postId,
  liked,
  count,
  viewerId,
  onChange,
  className,
}: {
  postId: string;
  liked: boolean;
  count: number;
  viewerId: string | null;
  onChange: (postId: string, likesCount: number, liked: boolean) => void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [pop, setPop] = useState(0);

  const toggle = async () => {
    if (!viewerId) {
      toast.error("Sign in to like posts");
      return;
    }
    if (busy) return;
    setBusy(true);
    const next = !liked;
    if (next) setPop((n) => n + 1);
    onChange(postId, Math.max(0, count + (next ? 1 : -1)), next);
    try {
      const response = await fetch(`/api/threads/${postId}/like`, { method: "POST" });
      if (!response.ok) throw new Error(String(response.status));
      const data: { likesCount: number; liked: boolean } = await response.json();
      onChange(postId, data.likesCount, data.liked);
    } catch {
      onChange(postId, count, liked);
      toast.error("Couldn't save your like. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={liked}
      aria-label={`${liked ? "Unlike" : "Like"} post, ${count} ${count === 1 ? "like" : "likes"}`}
      className={cn(
        "relative z-[2] -ml-2.5 inline-flex h-[34px] items-center gap-1.5 rounded-full px-2.5 text-[13.5px] font-semibold tabular-nums transition-colors",
        "hover:bg-heart/10 hover:text-heart focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand",
        liked ? "text-heart" : "text-ink-2",
        className
      )}
    >
      <Heart
        key={pop}
        aria-hidden="true"
        className={cn("h-[18px] w-[18px]", liked && "fill-current", pop > 0 && "animate-heart-pop motion-reduce:animate-none")}
      />
      <span>{count}</span>
    </button>
  );
}
