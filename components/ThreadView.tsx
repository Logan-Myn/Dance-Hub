"use client";

import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  Heart,
  MessageSquare,
  MoreHorizontal,
  Edit2,
  Trash2,
  MessageCircle,
  Pin,
  Send,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { formatDisplayName } from "@/lib/utils";
import { CATEGORY_ICONS } from "@/lib/constants";
import { toast } from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import Comment from "./Comment";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "./ui/input";
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
}

interface Comment {
  id: string;
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
  onReply: (commentId: string, content: string) => Promise<void>;
  onLikeUpdate: (
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

  // Use comments from props if available, otherwise fetch
  useEffect(() => {
    // If thread already has comments, use them directly
    if (thread.comments && thread.comments.length > 0) {
      setLocalComments(thread.comments);
      return;
    }

    // Only fetch if we have a thread id and no comments in props
    async function fetchComments() {
      try {
        const response = await fetch(`/api/threads/${thread.id}/comments`);
        if (response.ok) {
          const comments = await response.json();
          setLocalComments(comments);
          onThreadUpdate?.(thread.id, { comments });
        }
      } catch (error) {
        console.error("Error fetching comments:", error);
      }
    }

    if (thread.id) {
      fetchComments();
    }
  }, [thread.id, thread.comments]);

  // No sync from props for likes - we use optimistic updates only
  // The initial state is set from props when the component mounts

  const iconConfig = CATEGORY_ICONS.find(
    (i) => i.label === thread.category_type
  );
  const IconComponent = iconConfig?.icon || MessageCircle;

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

  const handleSubmitComment = async (e: React.FormEvent) => {
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
      toast.success("Comment posted successfully");
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

      onThreadUpdate?.(thread.id, {
        title: editedTitle.trim(),
        content: editedContent.trim(),
      });

      thread.title = editedTitle.trim();
      thread.content = editedContent.trim();

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
    onReply: handleReply,
    onLikeUpdate: handleCommentLike,
    replies: comment.replies?.map((reply: Comment) => mapCommentToProps(reply)),
  });

  const userDisplayName =
    userProfile?.display_name ||
    userProfile?.full_name ||
    user?.name ||
    user?.email?.split("@")[0] ||
    "Anonymous";
  const userAvatarUrl = userProfile?.avatar_url || user?.image;
  const userInitial = userDisplayName[0]?.toUpperCase() || "A";

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

  const rootClassName =
    layout === "page"
      ? "flex flex-col gap-4 bg-card border-border/50 overflow-hidden h-full"
      : "flex flex-col gap-4 max-h-[90vh] bg-card border-border/50 rounded-2xl overflow-hidden";

  return (
    <>
      <div className={rootClassName}>
        {layout === "page" && headerSlot ? (
          <div className="shrink-0 border-b border-border/50">{headerSlot}</div>
        ) : null}
          {/* Header Section */}
          <div className="p-6 pb-0">
            {/* Author info and metadata */}
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-start gap-3">
                <Avatar className="h-11 w-11 ring-2 ring-primary/20 flex-shrink-0">
                  <AvatarImage
                    src={thread.author.image}
                    alt={thread.author.name}
                  />
                  <AvatarFallback className="bg-primary/10 text-primary font-medium">
                    {thread.author.name?.[0]?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-foreground">
                    {thread.author.name}
                  </span>
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-sm">
                    <span className="text-muted-foreground">
                      {formatDistanceToNow(new Date(thread.created_at))} ago
                    </span>
                    <span className="text-muted-foreground">·</span>
                    {iconConfig ? (
                      <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-muted/50">
                        <IconComponent
                          className="h-3.5 w-3.5"
                          style={{ color: iconConfig.color }}
                        />
                        <span
                          className="text-sm font-medium"
                          style={{ color: iconConfig.color }}
                        >
                          {thread.category || "General"}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm font-medium text-muted-foreground px-2.5 py-0.5 rounded-full bg-muted/50">
                        {thread.category || "General"}
                      </span>
                    )}
                    {thread.pinned && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <div className="flex items-center gap-1 text-primary">
                          <Pin className="h-3 w-3" />
                          <span className="text-xs font-medium">Pinned</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions dropdown */}
              <div className="flex items-center gap-2">
                {(isCreator || isOwner) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 p-0 rounded-full hover:bg-muted transition-colors duration-200"
                      >
                        <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-xl border-border/50">
                      {isCreator && (
                        <DropdownMenuItem
                          onClick={handleTogglePin}
                          className="rounded-lg cursor-pointer"
                        >
                          <Pin className="h-4 w-4 mr-2" />
                          {thread.pinned ? "Unpin" : "Pin"}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => setIsEditing(true)}
                        className="rounded-lg cursor-pointer"
                      >
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setShowDeleteDialog(true)}
                        className="text-destructive focus:text-destructive rounded-lg cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Thread content */}
            {isEditing ? (
              <div className="space-y-4 mb-4">
                <Input
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="font-display text-xl md:text-2xl font-semibold border-border/50 rounded-xl focus:ring-primary/50"
                  placeholder="Thread title"
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
                  <Button
                    variant="outline"
                    onClick={handleCancelEdit}
                    className="rounded-xl border-border/50 hover:bg-muted"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveEdit}
                    disabled={!editedTitle.trim() || !editedContent.trim()}
                    className="rounded-xl bg-primary hover:bg-primary/90"
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="font-display text-xl md:text-2xl font-semibold text-foreground mb-4">
                  {editedTitle}
                </h2>
                <div className="prose prose-sm max-w-none text-foreground">
                  <Editor
                    content={editedContent}
                    onChange={() => {}}
                    editable={false}
                  />
                </div>
              </>
            )}

            {/* Interaction buttons */}
            <div className="flex items-center gap-2 border-t border-border/30 pt-4 mt-4">
              <button
                onClick={handleLike}
                disabled={isLiking || !user}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm",
                  "transition-all duration-200 ease-out border-2",
                  isLiked
                    ? "bg-pink-50 text-pink-500 border-pink-200"
                    : "bg-card text-muted-foreground border-border/50 hover:border-pink-200 hover:text-pink-500"
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
              <div className="flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm text-muted-foreground border-2 border-border/50 bg-card">
                <MessageSquare className="h-4 w-4" />
                <span>{thread.comments_count} comments</span>
              </div>
            </div>
          </div>

          {/* Comment input - between thread and comments */}
          <div className="px-6 py-4 bg-muted/30 border-y border-border/30">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9 ring-2 ring-primary/20 flex-shrink-0">
                <AvatarImage src={userAvatarUrl} alt={userDisplayName} />
                <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Write a comment..."
                  className="w-full min-h-[44px] max-h-32 resize-none py-2.5 px-4 rounded-2xl border border-border/50 bg-card focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-200 text-sm"
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && comment.trim()) {
                      e.preventDefault();
                      handleSubmitComment(e);
                    }
                  }}
                />
              </div>
              <Button
                onClick={handleSubmitComment}
                disabled={isSubmitting || !comment.trim()}
                size="icon"
                className="h-11 w-11 rounded-xl bg-primary hover:bg-primary/90 flex-shrink-0 transition-all duration-200"
              >
                <Send className={cn(
                  "h-4 w-4",
                  isSubmitting && "animate-pulse"
                )} />
              </Button>
            </div>
          </div>

          {/* Comments section - scrollable */}
          <div className="flex-1 overflow-y-auto p-6 bg-background/50">
            {organizedComments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <p className="text-muted-foreground font-medium">No comments yet</p>
                <p className="text-sm text-muted-foreground/70">Be the first to share your thoughts</p>
              </div>
            ) : (
              <div className="space-y-4">
                {organizedComments.map((comment) => (
                  <Comment key={comment.id} {...mapCommentToProps(comment)} />
                ))}
              </div>
            )}
          </div>
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
