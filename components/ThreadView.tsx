"use client";

import {
  Heart,
  MoreHorizontal,
  Edit2,
  Trash2,
  MessageCircle,
  Pin,
  Send,
  Link2,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect, useRef } from "react";
import Comment from "./Comment";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Editor from "./Editor";
import { cn } from "@/lib/utils";
import { InitialsAvatar } from "@/components/ds/initials-avatar";
import { MENU_ITEM, POP } from "@/components/community-shell/menu-styles";
import { BTN_GHOST, BTN_PRIMARY } from "@/components/community-feed/feed-header";

// Replies shown before "Show N earlier replies".
const VISIBLE_REPLIES = 5;

export interface ThreadViewProps {
  onClose: () => void;
  thread: {
    id: string;
    user_id: string;
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
    comments?: {
      id: string;
      content: string;
      author: {
        name: string;
        image: string;
      };
      created_at: string;
      replies?: any[];
      parent_id?: string;
      likes?: string[];
      likes_count?: number;
    }[];
    pinned?: boolean;
  };
  onLikeUpdate: (
    threadId: string,
    newLikesCount: number,
    liked: boolean
  ) => void;
  onCommentUpdate?: (threadId: string, newComment: any) => void;
  onThreadUpdate?: (
    threadId: string,
    updates: {
      title?: string;
      content?: string;
      comments?: any[];
      comments_count?: number;
      pinned?: boolean;
    }
  ) => void;
  onDelete?: (threadId: string) => void;
  isCreator?: boolean;
  layout?: "modal" | "page";
  headerSlot?: React.ReactNode;
  /** Color dot for the topic in the header. */
  categoryColor?: string;
  /** The community owner, shown with a Teacher badge. */
  teacherId?: string;
  /** Put the cursor in the reply box on open ("Be the first to answer"). */
  autoFocusReply?: boolean;
}

interface Comment {
  id: string;
  user_id?: string;
  content: string;
  author: {
    name: string;
    image: string;
  };
  created_at: string;
  replies?: Comment[];
  parent_id?: string;
  likes?: string[];
  likes_count?: number;
}

interface CommentProps extends Comment {
  threadId: string;
  teacherId?: string;
  onReply: (commentId: string, content: string) => Promise<void>;
  onLike: (
    commentId: string,
    newLikesCount: number,
    liked: boolean
  ) => void;
  replies?: CommentProps[];
}

export default function ThreadView({
  onClose,
  thread,
  onLikeUpdate,
  onCommentUpdate,
  onThreadUpdate,
  onDelete,
  isCreator = false,
  layout = "modal",
  headerSlot,
  categoryColor,
  teacherId,
  autoFocusReply = false,
}: ThreadViewProps) {
  const { user, session } = useAuth();
  const [isLiking, setIsLiking] = useState(false);
  const [localLikesCount, setLocalLikesCount] = useState(thread.likes_count);
  const [localLikes, setLocalLikes] = useState(thread.likes || []);
  const isLiked = user ? localLikes.includes(user.id) : false;
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(thread.title);
  const [editedContent, setEditedContent] = useState(thread.content);
  const isOwner = user?.id === thread.user_id;
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [localComments, setLocalComments] = useState(thread.comments || []);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [showAllComments, setShowAllComments] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocusReply) replyRef.current?.focus();
  }, [autoFocusReply]);

  // Fetch user profile on mount
  useEffect(() => {
    async function fetchUserProfile() {
      if (!user) return;

      try {
        const response = await fetch(`/api/profile?userId=${user.id}`);
        if (response.ok) {
          const profile = await response.json();
          if (profile) {
            setUserProfile(profile);
          }
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
      }
    }

    fetchUserProfile();
  }, [user]);

  // Use comments from props if available, otherwise fetch on demand.
  // The feed list now ships threads without comment bodies (count only),
  // so the modal/page lazy-loads them when first opened.
  // Runs once per thread id: parents store the fetched comments (a new array
  // each time) or refresh the route, so depending on thread.comments here
  // re-fetched forever for threads with no comments.
  const loadedCommentsFor = useRef<string | null>(null);
  useEffect(() => {
    if (!thread.id || loadedCommentsFor.current === thread.id) return;
    loadedCommentsFor.current = thread.id;

    if (thread.comments !== undefined && thread.comments.length > 0) {
      setLocalComments(thread.comments);
      return;
    }

    let cancelled = false;
    let done = false;
    async function fetchComments() {
      try {
        const response = await fetch(`/api/threads/${thread.id}/comments`);
        if (!response.ok || cancelled) return;
        const comments = await response.json();
        if (cancelled || !Array.isArray(comments)) return;
        setLocalComments(comments);
        // Only tell the parent when there is something new to store.
        if (comments.length > 0) {
          onThreadUpdate?.(thread.id, { comments });
        }
      } catch (error) {
        console.error("Error fetching comments:", error);
      } finally {
        done = true;
      }
    }

    fetchComments();
    return () => {
      cancelled = true;
      // Unmounted mid-fetch (e.g. Strict Mode's double mount): let the next
      // mount fetch again instead of never loading.
      if (!done) loadedCommentsFor.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  // No sync from props for likes - we use optimistic updates only
  // The initial state is set from props when the component mounts

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!user || !session) {
      toast.error("Please sign in to like threads");
      return;
    }

    if (isLiking) return;

    setIsLiking(true);
    try {
      const response = await fetch(`/api/threads/${thread.id}/like`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: user.id }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to like thread");
      }

      const data = await response.json();
      // Update the thread's likes count in the parent component
      onLikeUpdate(thread.id, data.likesCount, data.liked);
      // Update local state
      setLocalLikesCount(data.likesCount);
      setLocalLikes(data.liked
        ? [...localLikes, user.id]
        : localLikes.filter(id => id !== user.id)
      );
    } catch (error) {
      console.error("Error liking thread:", error);
      toast.error("Failed to like thread. Please try again.");
    } finally {
      setIsLiking(false);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent | React.KeyboardEvent) => {
    e.preventDefault();

    if (!user || !session) {
      toast.error("Please sign in to comment");
      return;
    }

    if (!comment.trim()) return;

    setIsSubmitting(true);

    try {
      // Use userProfile fetched on modal open, or fallback to user data
      const displayName = userProfile?.display_name || userProfile?.full_name || user.name || "Anonymous";
      const avatarUrl = userProfile?.avatar_url || user.image;

      const response = await fetch(`/api/threads/${thread.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: comment.trim(),
          userId: user.id,
          author: {
            id: user.id,
            name: displayName,
            avatar_url: avatarUrl,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to post comment");
      }

      const newComment = await response.json();
      // Update local state immediately so user sees the comment
      setLocalComments(prev => [...prev, newComment]);
      onCommentUpdate?.(thread.id, newComment);
      setComment("");
      if (replyRef.current) replyRef.current.style.height = "";
      toast.success("Reply posted");
    } catch (error) {
      console.error("Error posting comment:", error);
      toast.error("Failed to post comment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editedTitle.trim() || !editedContent.trim()) {
      toast.error("Title and content cannot be empty");
      return;
    }

    if (!session) {
      toast.error("Please sign in to edit the thread");
      return;
    }

    try {
      const response = await fetch(`/api/threads/${thread.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: editedTitle.trim(),
          content: editedContent.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to update thread");
      }

      // Show what the server stored (sanitized), not the editor's HTML.
      const saved: { title: string; content: string } = await response.json();
      onThreadUpdate?.(thread.id, {
        title: saved.title,
        content: saved.content,
      });

      setIsEditing(false);
      toast.success("Thread updated successfully");
    } catch (error) {
      console.error("Error updating thread:", error);
      toast.error("Failed to update thread. Please try again.");
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedTitle(thread.title);
    setEditedContent(thread.content);
  };

  const handleDelete = async () => {
    if (!session) {
      toast.error("Please sign in to delete the thread");
      return;
    }

    try {
      const response = await fetch(`/api/threads/${thread.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to delete thread");
      }

      onDelete?.(thread.id);
      onClose();
      toast.success("Thread deleted successfully");
    } catch (error) {
      console.error("Error deleting thread:", error);
      toast.error("Failed to delete thread. Please try again.");
    }
  };

  const handleReply = async (commentId: string, content: string) => {
    if (!user || !session) {
      toast.error("Please sign in to reply");
      return;
    }

    try {
      // Use userProfile fetched on modal open, or fallback to user data
      const displayName = userProfile?.display_name || userProfile?.full_name || user.name || "Anonymous";
      const avatarUrl = userProfile?.avatar_url || user.image;

      const response = await fetch(
        `/api/threads/${thread.id}/comments/${commentId}/reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: content.trim(),
            userId: user.id,
            author: {
              id: user.id,
              name: displayName,
              avatar_url: avatarUrl,
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to post reply");
      }

      const newReply = await response.json();

      // Update the comments array with the new reply
      const updatedComments = localComments.map((comment) => {
        if (comment.id === commentId) {
          // Add the reply to the parent comment's replies array
          return {
            ...comment,
            replies: [...(comment.replies || []), newReply],
          };
        }
        return comment;
      });

      // Also add the reply to the flat list of comments
      updatedComments.push({
        ...newReply,
        likes: [],
        likes_count: 0,
        replies: [],
      });

      // Update local state immediately
      setLocalComments(updatedComments);

      // Update parent state
      onThreadUpdate?.(thread.id, {
        comments: updatedComments,
        comments_count: (thread.comments_count || 0) + 1,
      });

      return newReply;
    } catch (error) {
      console.error("Error posting reply:", error);
      toast.error("Failed to post reply. Please try again.");
      throw error;
    }
  };

  const handleCommentLike = (
    commentId: string,
    newLikesCount: number,
    liked: boolean
  ) => {
    const updatedComments = localComments.map((comment) => {
      if (comment.id === commentId) {
        return {
          ...comment,
          likes_count: newLikesCount,
          likes:
            liked && user?.id
              ? [...(comment.likes || []), user.id]
              : (comment.likes || []).filter(
                  (likeId: string) => likeId !== user?.id
                ),
        };
      }
      // Also check nested replies
      if (comment.replies?.length) {
        return {
          ...comment,
          replies: comment.replies.map((reply) => {
            if (reply.id === commentId) {
              return {
                ...reply,
                likes_count: newLikesCount,
                likes:
                  liked && user?.id
                    ? [...(reply.likes || []), user.id]
                    : (reply.likes || []).filter(
                        (likeId: string) => likeId !== user?.id
                      ),
              };
            }
            return reply;
          }),
        };
      }
      return comment;
    });

    // Update local state immediately
    setLocalComments(updatedComments);

    // Update parent state
    onThreadUpdate?.(thread.id, {
      comments: updatedComments,
    });
  };

  // Organize comments into a hierarchical structure
  const organizeComments = (comments: Comment[] = []) => {
    const commentMap = new Map();
    const topLevelComments: Comment[] = [];

    // First pass: Create a map of all comments
    for (const comment of comments) {
      commentMap.set(comment.id, { ...comment, replies: [] });
    }

    // Second pass: Organize into hierarchy
    for (const comment of comments) {
      const commentWithReplies = commentMap.get(comment.id);
      if (comment.parent_id) {
        // This is a reply - add it to its parent's replies
        const parent = commentMap.get(comment.parent_id);
        if (parent) {
          parent.replies.push(commentWithReplies);
        }
      } else {
        // This is a top-level comment
        topLevelComments.push(commentWithReplies);
      }
    }

    return topLevelComments;
  };

  const organizedComments = organizeComments(localComments);

  // Add this helper function before the return statement
  const mapCommentToProps = (comment: Comment): CommentProps => ({
    ...comment,
    threadId: thread.id,
    teacherId,
    onReply: handleReply,
    onLike: handleCommentLike,
    replies: comment.replies?.map((reply: Comment) => mapCommentToProps(reply)),
  });

  const userDisplayName =
    userProfile?.display_name ||
    userProfile?.full_name ||
    user?.name ||
    user?.email?.split("@")[0] ||
    "Anonymous";
  const userAvatarUrl = userProfile?.avatar_url || user?.image;

  const handleTogglePin = async () => {
    if (!session) {
      toast.error("Please sign in to pin/unpin threads");
      return;
    }

    try {
      const response = await fetch(`/api/threads/${thread.id}/pin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to toggle pin status");
      }

      const { pinned } = await response.json();
      onThreadUpdate?.(thread.id, { pinned });
      toast.success(
        pinned ? "Thread pinned successfully" : "Thread unpinned successfully"
      );
    } catch (error) {
      console.error("Error toggling pin status:", error);
      toast.error("Failed to toggle pin status. Please try again.");
    }
  };

  const shownComments =
    showAllComments || organizedComments.length <= VISIBLE_REPLIES
      ? organizedComments
      : organizedComments.slice(-VISIBLE_REPLIES);
  const hiddenCount = organizedComments.length - shownComments.length;
  const replyCount = thread.comments_count ?? localComments.length;

  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?thread=${thread.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  const iconBtn =
    "grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand data-[state=open]:bg-surface-2";

  return (
    <>
      <div className={cn("flex min-h-0 flex-1 flex-col bg-surface text-ink", layout === "page" && "h-full")}>
        {layout === "page" && headerSlot ? <div className="shrink-0 border-b border-line">{headerSlot}</div> : null}

        <div className="flex shrink-0 items-center gap-3 border-b border-line py-3 pl-4 pr-3 sm:pl-[22px]">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[13.5px] font-medium text-ink-2">
            {categoryColor && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColor }} />}
            <span className="truncate">{thread.category || "General"}</span>
          </span>
          {thread.pinned && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[12px] font-semibold text-brand-ink">
              <Pin className="h-3 w-3" aria-hidden="true" />
              Pinned
            </span>
          )}
          <span className="flex-1" />
          <button type="button" onClick={copyLink} className={iconBtn} aria-label="Copy link to this post" title="Copy link">
            <Link2 className="h-5 w-5" aria-hidden="true" />
          </button>
          {(isCreator || isOwner) && (
            <DropdownMenu>
              <DropdownMenuTrigger className={iconBtn} aria-label="Post options">
                <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className={cn(POP, "w-48")}>
                {isCreator && (
                  <DropdownMenuItem onSelect={handleTogglePin} className={MENU_ITEM}>
                    <Pin aria-hidden="true" />
                    {thread.pinned ? "Unpin" : "Pin to the top"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onSelect={() => {
                    setEditedTitle(thread.title);
                    setEditedContent(thread.content);
                    setIsEditing(true);
                  }}
                  className={MENU_ITEM}
                >
                  <Edit2 aria-hidden="true" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setShowDeleteDialog(true)} className={cn(MENU_ITEM, "text-live [&>svg]:text-live")}>
                  <Trash2 aria-hidden="true" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {layout === "modal" && (
            <button type="button" onClick={onClose} className={iconBtn} aria-label="Close">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2 pt-5 sm:px-[22px]">
          <div className="flex items-center gap-3">
            <InitialsAvatar id={thread.user_id} name={thread.author.name} imageUrl={thread.author.image || null} size={40} />
            <div className="min-w-0">
              <span className="flex items-center gap-2 font-semibold text-ink">
                {thread.author.name}
                {teacherId && thread.user_id === teacherId && (
                  <span className="rounded-full bg-brand-soft px-[7px] py-0.5 text-[11.5px] font-semibold text-brand-ink">Teacher</span>
                )}
              </span>
              <time dateTime={thread.created_at} className="block text-[13px] text-ink-3">
                {formatDistanceToNow(new Date(thread.created_at), { addSuffix: true })}
              </time>
            </div>
          </div>

          {isEditing ? (
            <div className="mt-4 flex flex-col gap-3">
              <label htmlFor={`edit-title-${thread.id}`} className="sr-only">Title</label>
              <input
                id={`edit-title-${thread.id}`}
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                maxLength={120}
                className="w-full rounded-[10px] border border-line bg-surface px-3 py-2.5 font-display text-[19px] font-semibold text-ink outline-none focus:border-brand focus:shadow-[0_0_0_3px_rgb(var(--ds-brand)/0.18)]"
                placeholder="Title"
              />
              <Editor
                content={editedContent}
                onChange={(html) => setEditedContent(html)}
                editable={true}
                showHeadings={false}
                showParagraphStyle={false}
                showAlignment={false}
                placeholder="Write your post..."
                minHeight="120px"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={handleCancelEdit} className={BTN_GHOST}>
                  Cancel
                </button>
                <button type="button" onClick={handleSaveEdit} disabled={!editedTitle.trim() || !editedContent.trim()} className={BTN_PRIMARY}>
                  Save changes
                </button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="mb-2.5 mt-4 text-balance font-display text-[22px] font-semibold leading-[1.2] tracking-[-0.012em] text-ink sm:text-[26px]">
                {thread.title}
              </h2>
              <div className="prose max-w-[65ch] text-[16px] leading-[1.65] text-ink prose-p:my-2 prose-a:text-brand-ink">
                <Editor content={thread.content} onChange={() => {}} editable={false} />
              </div>
            </>
          )}

          <div className="flex items-center gap-2 border-b border-line py-3.5">
            <button
              type="button"
              onClick={handleLike}
              disabled={isLiking}
              aria-pressed={isLiked}
              aria-label={`${isLiked ? "Unlike" : "Like"} post, ${localLikesCount} likes`}
              className={cn(
                "-ml-2.5 inline-flex h-[34px] items-center gap-1.5 rounded-full px-2.5 text-[13.5px] font-semibold tabular-nums transition-colors hover:bg-heart/10 hover:text-heart",
                isLiked ? "text-heart" : "text-ink-2"
              )}
            >
              <Heart className={cn("h-[18px] w-[18px]", isLiked && "fill-current")} aria-hidden="true" />
              {localLikesCount}
            </button>
            <span className="inline-flex items-center gap-1.5 px-1 text-[13.5px] font-semibold text-ink-2">
              <MessageCircle className="h-[18px] w-[18px]" aria-hidden="true" />
              {replyCount} {replyCount === 1 ? "reply" : "replies"}
            </span>
          </div>

          <section aria-label="Replies" className="flex flex-col gap-[18px] pb-3 pt-[18px]">
            {organizedComments.length === 0 ? (
              <p className="text-[15px] text-ink-2">No replies yet. Be the first to answer.</p>
            ) : (
              <>
                <h3 className="font-display text-[15px] font-semibold text-ink">
                  {localComments.length} {localComments.length === 1 ? "reply" : "replies"}
                </h3>
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAllComments(true)}
                    className="-ml-2.5 self-start rounded-lg px-2.5 py-1.5 text-[13.5px] font-semibold text-brand-ink hover:bg-brand-soft"
                  >
                    Show {hiddenCount} earlier {hiddenCount === 1 ? "reply" : "replies"}
                  </button>
                )}
                {shownComments.map((comment) => (
                  <Comment key={comment.id} {...mapCommentToProps(comment)} />
                ))}
              </>
            )}
          </section>
        </div>

        <form
          onSubmit={handleSubmitComment}
          className="flex shrink-0 items-end gap-2.5 border-t border-line bg-surface px-3 py-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:px-4"
        >
          <InitialsAvatar id={user?.id ?? "me"} name={userDisplayName} imageUrl={userAvatarUrl || null} size={32} className="mb-1.5 hidden sm:inline-grid" />
          <label htmlFor={`reply-${thread.id}`} className="sr-only">Write a reply</label>
          <textarea
            ref={replyRef}
            id={`reply-${thread.id}`}
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            placeholder="Write a reply…"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && comment.trim()) {
                e.preventDefault();
                handleSubmitComment(e);
              }
            }}
            className="h-11 max-h-40 min-h-11 min-w-0 flex-1 resize-none rounded-[10px] border border-line bg-surface px-3 py-[11px] text-[15px] leading-[1.4] text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-3 focus:border-brand focus:shadow-[0_0_0_3px_rgb(var(--ds-brand)/0.18)]"
          />
          <button type="submit" disabled={isSubmitting || !comment.trim()} className={cn(BTN_PRIMARY, "h-11")}>
            <Send aria-hidden="true" />
            <span className="hidden sm:inline">Reply</span>
          </button>
        </form>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="rounded-2xl border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your
              thread and all its comments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl border-border/50">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="rounded-xl bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
