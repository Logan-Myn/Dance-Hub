"use client";

import { useState } from "react";
import { InitialsAvatar } from "@/components/ds/initials-avatar";
import { Heart, MessageCircle, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from 'date-fns';
import { formatDisplayName } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";

interface CommentProps {
  id: string;
  content: string;
  author: {
    name: string;
    image: string;
  };
  created_at: string;
  threadId: string;
  /** Author's user id: "(you)" and the Teacher badge. */
  user_id?: string;
  teacherId?: string;
  parent_id?: string;
  likes?: string[];
  likes_count?: number;
  replies?: CommentProps[];
  onLike?: (commentId: string, newLikesCount: number, liked: boolean) => void;
  onReply?: (commentId: string, content: string) => Promise<any>;
}

export default function Comment({
  id,
  content,
  author,
  created_at,
  threadId,
  user_id,
  teacherId,
  parent_id,
  likes = [],
  likes_count = 0,
  replies = [],
  onLike,
  onReply
}: CommentProps) {
  const { user, session } = useAuth();
  const [isLiking, setIsLiking] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [showReplies, setShowReplies] = useState(true);
  const [localLikes, setLocalLikes] = useState<string[]>(likes || []);
  const [localLikesCount, setLocalLikesCount] = useState(likes_count || 0);
  const isLiked = user?.id ? localLikes.includes(user.id) : false;

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!user) {
      toast.error('Please sign in to like comments');
      return;
    }

    if (isLiking) return;

    setIsLiking(true);

    const wasLiked = localLikes.includes(user.id);
    const newLikes = wasLiked
      ? localLikes.filter(likeId => likeId !== user.id)
      : [...localLikes, user.id];
    const newLikesCount = wasLiked ? localLikesCount - 1 : localLikesCount + 1;

    // Optimistic update
    setLocalLikes(newLikes);
    setLocalLikesCount(newLikesCount);

    try {
      if (!session) {
        throw new Error('No active session');
      }

      const response = await fetch(`/api/threads/${threadId}/comments/${id}/like`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user.id }),
      });

      if (!response.ok) {
        // Revert to pre-optimistic state.
        setLocalLikes(localLikes);
        setLocalLikesCount(localLikesCount);
        const error = await response.text();
        throw new Error(error || 'Failed to like comment');
      }

      const data = await response.json();
      // Update with server response
      setLocalLikesCount(data.likes_count);
      onLike?.(id, data.likes_count, data.liked);
    } catch (error) {
      console.error('Error liking comment:', error);
      if (error instanceof Error && error.message.includes('session')) {
        toast.error('Please sign in again to like comments');
      } else {
        toast.error('Failed to like comment. Please try again.');
      }
    } finally {
      setIsLiking(false);
    }
  };

  const handleSubmitReply = async () => {
    if (!replyContent.trim()) return;

    try {
      setIsSubmittingReply(true);
      const newReply = await onReply?.(id, replyContent);
      if (newReply) {
        setReplyContent('');
        setIsReplying(false);
        setShowReplies(true);
      }
    } catch (error) {
      console.error('Error submitting reply:', error);
    } finally {
      setIsSubmittingReply(false);
    }
  };

  // No sync from props - we use optimistic updates only
  // The initial state is set from props when the component mounts

  const displayName = formatDisplayName(author.name);
  const isYou = !!user?.id && user_id === user.id;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
        <InitialsAvatar id={user_id || id} name={displayName} imageUrl={author.image || null} size={32} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[13px] text-ink-3">
            <span className="text-[14px] font-semibold text-ink">
              {displayName}
              {isYou && <span className="font-normal text-ink-3"> (you)</span>}
            </span>
            {teacherId && user_id === teacherId && (
              <span className="rounded-full bg-brand-soft px-[7px] py-0.5 text-[11.5px] font-semibold text-brand-ink">Teacher</span>
            )}
            <time dateTime={created_at}>{formatDistanceToNow(new Date(created_at), { addSuffix: true })}</time>
          </div>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] text-ink">{content}</p>

          <div className="-ml-2 mt-1 flex items-center gap-1">
            <button
              type="button"
              onClick={handleLike}
              disabled={isLiking}
              aria-pressed={isLiked}
              aria-label={`${isLiked ? "Unlike" : "Like"} reply, ${localLikesCount} likes`}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-full px-2 text-[12.5px] font-semibold tabular-nums transition-colors hover:bg-heart/10 hover:text-heart",
                isLiked ? "text-heart" : "text-ink-3"
              )}
            >
              <Heart className={cn("h-3.5 w-3.5", isLiked && "fill-current")} aria-hidden="true" />
              {localLikesCount > 0 && <span>{localLikesCount}</span>}
            </button>
            <button
              type="button"
              onClick={() => setIsReplying(!isReplying)}
              aria-expanded={isReplying}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-full px-2 text-[12.5px] font-semibold transition-colors hover:bg-surface-2 hover:text-ink",
                isReplying ? "text-brand-ink" : "text-ink-3"
              )}
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Reply
            </button>
          </div>

          {isReplying && (
            <div className="mt-2 flex flex-col gap-2">
              <label htmlFor={`reply-to-${id}`} className="sr-only">Reply to {displayName}</label>
              <textarea
                id={`reply-to-${id}`}
                autoFocus
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder={`Reply to ${displayName}…`}
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && replyContent.trim()) {
                    e.preventDefault();
                    handleSubmitReply();
                  } else if (e.key === "Escape") {
                    e.stopPropagation();
                    setIsReplying(false);
                    setReplyContent("");
                  }
                }}
                className="w-full resize-none rounded-[10px] border border-line bg-surface px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-brand focus:shadow-[0_0_0_3px_rgb(var(--ds-brand)/0.18)]"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsReplying(false);
                    setReplyContent("");
                  }}
                  className="h-8 rounded-lg px-3 text-[13px] font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitReply}
                  disabled={isSubmittingReply || !replyContent.trim()}
                  className="h-8 rounded-lg bg-brand px-3 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-55"
                >
                  {isSubmittingReply ? "Posting…" : "Reply"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {replies.length > 0 && (
        <div className="ml-4 border-l-2 border-line pl-4 sm:ml-[15px] sm:pl-5">
          <button
            type="button"
            onClick={() => setShowReplies(!showReplies)}
            aria-expanded={showReplies}
            className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-ink hover:underline hover:underline-offset-[3px]"
          >
            {showReplies ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
            {showReplies ? "Hide" : "Show"} {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </button>
          {showReplies && (
            <div className="flex flex-col gap-3">
              {replies.map((reply) => (
                <Comment key={reply.id} {...reply} threadId={threadId} teacherId={teacherId} onLike={onLike} onReply={onReply} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
