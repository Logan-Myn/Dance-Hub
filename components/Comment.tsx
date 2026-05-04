"use client";

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
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
  const initial = displayName[0]?.toUpperCase() || "U";

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <Avatar className="h-9 w-9 ring-2 ring-primary/20 flex-shrink-0">
          <AvatarImage src={author.image} alt={displayName} />
          <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
            {initial}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          {/* Comment bubble */}
          <div className="bg-muted/50 rounded-2xl rounded-tl-sm px-4 py-2.5 inline-block max-w-full">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-sm text-foreground">{displayName}</span>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(created_at), { addSuffix: true })}
              </span>
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap break-words">{content}</p>
          </div>

          {/* Actions row */}
          <div className="flex items-center gap-3 mt-1.5 ml-1">
            <button
              onClick={handleLike}
              disabled={isLiking || !user}
              className={cn(
                "flex items-center gap-1 text-xs font-medium rounded-full px-2 py-1 -ml-2",
                "hover:bg-primary/10",
                isLiked
                  ? "text-pink-500"
                  : "text-muted-foreground hover:text-pink-500"
              )}
            >
              <Heart
                className={cn(
                  "h-3.5 w-3.5",
                  isLiked && "fill-current",
                  isLiking && "animate-pulse scale-110"
                )}
              />
              {localLikesCount > 0 && <span>{localLikesCount}</span>}
            </button>

            <button
              onClick={() => setIsReplying(!isReplying)}
              className={cn(
                "flex items-center gap-1 text-xs font-medium text-muted-foreground",
                "transition-all duration-200 rounded-full px-2 py-1",
                "hover:bg-primary/10 hover:text-primary",
                isReplying && "text-primary"
              )}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>Reply</span>
            </button>
          </div>

          {/* Reply input */}
          {isReplying && (
            <div className="mt-3 space-y-2">
              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Write a reply..."
                className={cn(
                  "w-full rounded-2xl border border-border/50 bg-card px-4 py-2.5 text-sm",
                  "placeholder:text-muted-foreground/60",
                  "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50",
                  "transition-all duration-200 resize-none"
                )}
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && replyContent.trim()) {
                    e.preventDefault();
                    handleSubmitReply();
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setIsReplying(false);
                    setReplyContent('');
                  }}
                  className={cn(
                    "rounded-xl px-3 py-1.5 text-sm font-medium",
                    "text-muted-foreground hover:bg-muted",
                    "transition-all duration-200"
                  )}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitReply}
                  disabled={isSubmittingReply || !replyContent.trim()}
                  className={cn(
                    "rounded-xl px-3 py-1.5 text-sm font-medium",
                    "bg-primary text-primary-foreground",
                    "hover:bg-primary/90 disabled:opacity-50",
                    "transition-all duration-200"
                  )}
                >
                  {isSubmittingReply ? 'Posting...' : 'Reply'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Replies section */}
      {replies.length > 0 && (
        <div className="ml-6 pl-6 border-l-2 border-border/30">
          <button
            onClick={() => setShowReplies(!showReplies)}
            className={cn(
              "flex items-center gap-1.5 mb-3 text-sm font-medium",
              "text-primary hover:text-primary/80",
              "transition-colors duration-200"
            )}
          >
            {showReplies ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            <span>
              {showReplies ? 'Hide' : 'Show'} {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            </span>
          </button>

          {showReplies && (
            <div className="space-y-3">
              {replies.map((reply) => (
                <Comment
                  key={reply.id}
                  {...reply}
                  threadId={threadId}
                  onLike={onLike}
                  onReply={onReply}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
