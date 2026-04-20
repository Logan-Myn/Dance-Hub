'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ThreadView, { type ThreadViewProps } from '@/components/ThreadView';

// Shape matches the ThreadView prop (feed/thread model used by ThreadModal).
// getThreadById returns a CommunityThread; we adapt field names below.
type ThreadData = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  userId: string;
  author: { name: string; image: string };
  category: string;
  categoryId: string | null;
  likesCount: number;
  commentsCount: number;
  likes: string[];
  comments: Array<{
    id: string;
    thread_id: string;
    user_id: string;
    content: string;
    created_at: string;
    parent_id: string | null;
    author: { name: string; image: string };
    likes: string[];
    likes_count: number;
  }>;
  pinned: boolean;
};

type ThreadCategory = {
  id: string;
  name: string;
  iconType?: string;
};

export default function ThreadPageClient({
  communitySlug,
  thread,
  isCreator,
  threadCategories,
}: {
  communitySlug: string;
  thread: ThreadData;
  isCreator: boolean;
  threadCategories?: unknown;
}) {
  const router = useRouter();

  // Resolve category_type from the community's thread_categories using
  // thread.categoryId — mirrors FeedClient's iconType lookup so the pill
  // renders with the same icon + color as the desktop modal path.
  const categories = Array.isArray(threadCategories)
    ? (threadCategories as ThreadCategory[])
    : [];
  const matchedCategory = thread.categoryId
    ? categories.find((c) => c.id === thread.categoryId)
    : undefined;
  const categoryType = matchedCategory?.iconType;

  // ThreadView expects fields under the names the modal already uses.
  const viewThread: ThreadViewProps['thread'] = {
    id: thread.id,
    user_id: thread.userId,
    title: thread.title,
    content: thread.content,
    author: thread.author,
    created_at: thread.createdAt,
    likes_count: thread.likesCount,
    comments_count: thread.commentsCount,
    category: thread.category,
    category_type: categoryType,
    likes: thread.likes,
    comments: thread.comments.map((c) => ({
      ...c,
      parent_id: c.parent_id ?? undefined,
    })),
    pinned: thread.pinned,
  };

  const handleClose = () => {
    router.push(`/${communitySlug}`);
  };

  // The "like" / "comment" / "edit" mutations in ThreadView call these back.
  // For the route page, we don't have the parent feed list to update — we just
  // refresh the current route so SSR re-reads the latest state from DB.
  const noopLikeUpdate = () => router.refresh();
  const noopCommentUpdate = () => router.refresh();
  const noopThreadUpdate = () => router.refresh();
  const handleDelete = () => router.push(`/${communitySlug}`);

  const backHeader = (
    <div className="flex items-center gap-2 px-4 py-3">
      <Link
        href={`/${communitySlug}`}
        aria-label="Back to feed"
        className="p-2 -ml-2 rounded-full hover:bg-muted min-h-[44px] min-w-[44px] flex items-center justify-center"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <h1 className="sr-only">{thread.title}</h1>
      <div className="text-sm font-medium text-muted-foreground" aria-hidden="true">Thread</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <ThreadView
        thread={viewThread}
        onClose={handleClose}
        onLikeUpdate={noopLikeUpdate}
        onCommentUpdate={noopCommentUpdate}
        onThreadUpdate={noopThreadUpdate}
        onDelete={handleDelete}
        isCreator={isCreator}
        layout="page"
        headerSlot={backHeader}
      />
    </div>
  );
}
