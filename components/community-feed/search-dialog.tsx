"use client";

import { useCallback } from "react";
import { InitialsAvatar } from "@/components/ds/initials-avatar";
import { SearchPalette, type PaletteItem } from "@/components/ds/search-palette";
import { htmlToText, searchPosts } from "@/lib/feed/posts";
import type { FeedPost } from "./types";

type PostItem = PaletteItem & { post: FeedPost };

const toItem = (post: FeedPost, snippet: string): PostItem => ({
  id: post.id,
  title: post.title,
  subtitle: snippet ? `${post.author.name}: ${snippet}` : post.author.name,
  leading: <InitialsAvatar id={post.userId} name={post.author.name} imageUrl={post.author.image || null} size={28} />,
  post,
});

/** Search the loaded posts by title, text and author. */
export function SearchDialog({
  open,
  onOpenChange,
  posts,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  posts: FeedPost[];
  onPick: (post: FeedPost) => void;
}) {
  const search = useCallback(
    (query: string): PostItem[] =>
      query.trim()
        ? searchPosts(posts, query, 8).map((m) => toItem(m.post, m.snippet))
        : posts
            .slice()
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 4)
            .map((p) => toItem(p, htmlToText(p.content).slice(0, 120))),
    [posts]
  );
  return (
    <SearchPalette
      open={open}
      onOpenChange={onOpenChange}
      label="Search posts and people"
      placeholder="Search posts and people"
      search={search}
      emptyTitle="Posts"
      idleTitle="Recent posts"
      noResults={(q) => (q ? `Nothing matches "${q}".` : "No posts yet.")}
      onPick={(item) => onPick(item.post)}
    />
  );
}
