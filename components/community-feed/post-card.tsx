"use client";

import { memo, useMemo } from "react";
import { prefetchComments } from "@/lib/feed/comment-cache";
import { MessageCircle } from "lucide-react";
import { InitialsAvatar } from "@/components/ds/initials-avatar";
import { fullDateTime, timeAgo } from "@/lib/feed/time-ago";
import { htmlToText } from "@/lib/feed/posts";
import { cn } from "@/lib/utils";
import { LikeButton } from "./like-button";
import type { FeedPost, ThreadCategory } from "./types";

export function TeacherBadge() {
  return (
    <span className="rounded-full bg-brand-soft px-[7px] py-0.5 text-[11.5px] font-semibold text-brand-ink">Teacher</span>
  );
}

export function CategoryLabel({ category }: { category: ThreadCategory | undefined }) {
  if (!category) return null;
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-ink-2">
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
      {category.name}
    </span>
  );
}

/** One post in the feed. The title is a link to the post page; clicks open the dialog. */
export const PostCard = memo(function PostCard({
  post,
  href,
  category,
  isTeacher,
  isNew,
  fresh,
  viewerId,
  now,
  timeZone,
  onOpen,
  onLike,
  embedded = false,
}: {
  post: FeedPost;
  href: string;
  category: ThreadCategory | undefined;
  isTeacher: boolean;
  isNew: boolean;
  fresh?: boolean;
  viewerId: string | null;
  now: Date;
  timeZone: string;
  onOpen: (post: FeedPost, opts?: { focusReply?: boolean }) => void;
  onLike: (postId: string, likesCount: number, liked: boolean) => void;
  /** Inside the pinned box: no border or shadow of its own. */
  embedded?: boolean;
}) {
  const preview = useMemo(() => htmlToText(post.content), [post.content]);
  const liked = !!viewerId && (post.likes ?? []).includes(viewerId);
  const repliers = post.repliers ?? [];

  return (
    <article
      // Start loading the replies before the click, so the thread opens with them.
      onPointerEnter={post.commentsCount > 0 ? () => prefetchComments(post.id) : undefined}
      onPointerDown={post.commentsCount > 0 ? () => prefetchComments(post.id) : undefined}
      onFocusCapture={post.commentsCount > 0 ? () => prefetchComments(post.id) : undefined}
      className={cn(
        "group relative grid grid-cols-[36px_minmax(0,1fr)] gap-x-3 p-3.5 pb-2 sm:grid-cols-[40px_minmax(0,1fr)] sm:gap-x-3.5 sm:px-[18px] sm:pb-2.5 sm:pt-4",
        "transition-[border-color,box-shadow] duration-200 has-[a.post-link:focus-visible]:outline has-[a.post-link:focus-visible]:outline-2 has-[a.post-link:focus-visible]:outline-offset-2 has-[a.post-link:focus-visible]:outline-brand",
        embedded
          ? "rounded-b-2xl"
          : "rounded-2xl border border-line bg-surface hover:border-line-strong hover:shadow-raised",
        fresh && "animate-just-posted motion-reduce:animate-none"
      )}
    >
      <InitialsAvatar
        id={post.userId}
        name={post.author.name}
        imageUrl={post.author.image || null}
        size={40}
        className="mt-0.5 !h-9 !w-9 sm:!h-10 sm:!w-10"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13.5px] leading-snug text-ink-3">
          <span className="text-[14px] font-semibold text-ink">{post.author.name}</span>
          {isTeacher && <TeacherBadge />}
          <time dateTime={post.createdAt} title={fullDateTime(post.createdAt, timeZone)}>
            {timeAgo(post.createdAt, now, timeZone)}
          </time>
          <CategoryLabel category={category} />
        </div>
        <h2 className="mt-0.5 flex items-baseline gap-2 font-display text-[17px] font-semibold leading-[1.3] tracking-[-0.005em] text-ink group-hover:text-brand-ink sm:text-[18px]">
          {isNew && (
            <>
              <span aria-hidden="true" className="h-2 w-2 shrink-0 -translate-y-0.5 rounded-full bg-brand" />
              <span className="sr-only">New: </span>
            </>
          )}
          <a
            href={href}
            className="post-link outline-none after:absolute after:inset-0 after:z-[1] after:rounded-[inherit] after:content-['']"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              onOpen(post);
            }}
          >
            {post.title}
          </a>
        </h2>
        {preview && <p className="line-clamp-2 text-[15px] text-ink-2">{preview}</p>}
        <div className="mt-1.5 flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1">
          <LikeButton postId={post.id} liked={liked} count={post.likesCount} viewerId={viewerId} onChange={onLike} />
          {post.commentsCount === 0 ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-warn">
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                No replies yet
              </span>
              <button
                type="button"
                onClick={() => onOpen(post, { focusReply: true })}
                className="relative z-[2] inline-flex h-[34px] items-center rounded-full px-2.5 text-[13.5px] font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                Be the first to answer
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onOpen(post)}
                aria-label={`${post.commentsCount} ${post.commentsCount === 1 ? "reply" : "replies"}, open post`}
                className="relative z-[2] inline-flex h-[34px] items-center gap-1.5 rounded-full px-2.5 text-[13.5px] font-semibold tabular-nums text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <MessageCircle className="h-[18px] w-[18px]" aria-hidden="true" />
                {post.commentsCount}
              </button>
              {post.lastReplyAt && (
                <span className="inline-flex items-center gap-2 text-[13px] text-ink-3">
                  {repliers.length > 0 && (
                    <span className="flex">
                      {repliers.map((r, i) => (
                        <InitialsAvatar
                          key={r.id}
                          id={r.id}
                          name={r.name}
                          imageUrl={r.image || null}
                          size={24}
                          className={cn("ring-2 ring-surface", i > 0 && "-ml-1.5")}
                        />
                      ))}
                    </span>
                  )}
                  <span>
                    Last reply{" "}
                    <time dateTime={post.lastReplyAt} title={fullDateTime(post.lastReplyAt, timeZone)}>
                      {timeAgo(post.lastReplyAt, now, timeZone)}
                    </time>
                  </span>
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
});
