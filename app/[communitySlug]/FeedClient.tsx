"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import toast from "react-hot-toast";
import { useNextStep } from "nextstepjs";
import ThreadModal from "@/components/ThreadModal";
import { PreRegistrationComingSoon } from "@/components/PreRegistrationComingSoon";
import { ManageSubscriptionModal } from "@/components/community/ManageSubscriptionModal";
import { Composer, type ComposerHandle } from "@/components/community-feed/composer";
import { FeedHeader } from "@/components/community-feed/feed-header";
import { FilterBar } from "@/components/community-feed/filter-bar";
import { FeedEmpty, FeedError } from "@/components/community-feed/feed-states";
import { PinnedBox } from "@/components/community-feed/pinned-box";
import { PostCard } from "@/components/community-feed/post-card";
import { SearchDialog } from "@/components/community-feed/search-dialog";
import { CourseCard } from "@/components/community-feed/rail/course-card";
import { LessonsCard } from "@/components/community-feed/rail/lessons-card";
import { LinksCard } from "@/components/community-feed/rail/links-card";
import { AdminJoinCard, MembershipCard } from "@/components/community-feed/rail/membership-card";
import { NextClassCard } from "@/components/community-feed/rail/next-class-card";
import { OwnerTools } from "@/components/community-feed/rail/owner-tools";
import type {
  CourseProgress,
  FeedCommunity,
  FeedLesson,
  FeedPerson,
  FeedPost,
  FeedViewer,
  RosterMember,
  UpcomingClass,
} from "@/components/community-feed/types";
import { useNow } from "@/hooks/use-now";
import { useViewerTimeZone } from "@/hooks/use-viewer-time-zone";
import { fetcher } from "@/lib/fetcher";
import { formatDate } from "@/lib/format-date";
import { isNewPost } from "@/lib/feed/visits";
import { sortPosts, type FeedSort } from "@/lib/feed/posts";
import { registerPageSearch } from "@/lib/feed/search-slot";
import type { Offerings } from "@/lib/offerings";
import type { MembershipStatus } from "@/lib/community-data";
import { communityPath } from "@/lib/safe-redirect";

// Membership routes answer failures with { error } (a reason the member can
// act on) and, when the failure changed the membership, the new membership.
async function failureBody(response: Response): Promise<{ error?: string; membership?: MembershipStatus } | null> {
  return response.json().catch(() => null);
}

const WELCOME_TITLE = "Welcome! Start here";
const WELCOME_BODY =
  "<p>Welcome to the community. A few things to know:</p><ul><li><p>When and where classes happen.</p></li><li><p>Where to find replays and courses.</p></li><li><p>How to ask for feedback on your dancing.</p></li></ul><p>Say hello below and tell us where you dance.</p>";

export interface FeedClientProps {
  community: FeedCommunity;
  initialThreads: FeedPost[];
  viewer: FeedViewer;
  owner: FeedPerson;
  offerings: Offerings;
  isCreator: boolean;
  isAdmin: boolean;
  isMember: boolean;
  isPreRegistered: boolean;
  memberStatus: string | null;
  subscriptionStatus: string | null;
  accessEndDate: string | null;
  /** Roster size counted on the server; shown until the roster loads. */
  initialMemberCount?: number;
  /** "New" dots go on others' posts after this moment (lib/feed/visits.ts). */
  newSince: string | null;
  serverNow: number;
  upcomingClasses: UpcomingClass[];
  courseProgress: CourseProgress | null;
  lessons: FeedLesson[];
}

export default function FeedClient({
  community,
  initialThreads,
  viewer,
  owner,
  offerings,
  isCreator,
  isAdmin,
  isMember: initialIsMember,
  isPreRegistered,
  memberStatus: initialMemberStatus,
  subscriptionStatus: initialSubscriptionStatus,
  accessEndDate: initialAccessEndDate,
  initialMemberCount = 0,
  newSince,
  serverNow,
  upcomingClasses,
  courseProgress,
  lessons,
}: FeedClientProps) {
  const slug = community.slug;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const now = useNow(30_000, serverNow) ?? new Date(serverNow);
  const timeZone = useViewerTimeZone(viewer.timezone);

  // Posts and roster stay fresh in the background; posts start from the server.
  const {
    data: threadsData,
    error: threadsError,
    mutate: mutateThreads,
  } = useSWR<FeedPost[]>(`community-threads:${slug}`, fetcher, { fallbackData: initialThreads });
  const posts = useMemo(() => (Array.isArray(threadsData) ? threadsData : []), [threadsData]);
  const { data: roster } = useSWR<RosterMember[]>(`community-members:${slug}`, fetcher);

  // The viewer's own membership comes from the props, then from the leave /
  // reactivate responses. The roster leaves out canceling members and its
  // cache can predate a leave, so it is never the source.
  const [isMember, setIsMember] = useState(initialIsMember);
  const [subscriptionStatus, setSubscriptionStatus] = useState(initialSubscriptionStatus);
  const [accessEndDate, setAccessEndDate] = useState(initialAccessEndDate);
  const [, setMemberStatus] = useState(initialMemberStatus);
  const [showManageModal, setShowManageModal] = useState(false);

  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<FeedSort>("latest");
  const [selected, setSelected] = useState<FeedPost | null>(null);
  const [focusReply, setFocusReply] = useState(false);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const composer = useRef<ComposerHandle>(null);

  const categoriesById = useMemo(() => new Map(community.categories.map((c) => [c.id, c])), [community.categories]);

  // Record this visit once the feed is on screen ("New" markers next time).
  useEffect(() => {
    if (!initialIsMember && !isCreator) return;
    fetch(`/api/community/${encodeURIComponent(slug)}/feed-visit`, { method: "POST" }).catch(() => {});
  }, [slug, initialIsMember, isCreator]);

  // Top bar search, "/" for search and "N" for a new post, only while the
  // feed itself is on screen (not the coming-soon screen).
  const feedShown = !(isPreRegistered && !isMember) && (isMember || isCreator || isAdmin);
  useEffect(() => (feedShown ? registerPageSearch(() => setSearchOpen(true), "Search posts") : undefined), [feedShown]);
  useEffect(() => {
    if (!feedShown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "/") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        composer.current?.open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [feedShown]);

  // Onboarding tour for owners, once per community and browser.
  const { startNextStep, currentTour } = useNextStep();
  const tourScheduled = useRef(false);
  useEffect(() => {
    if (!isCreator || tourScheduled.current || currentTour === "onboarding") return;
    try {
      if (localStorage.getItem(`onboarding-tour-completed-${slug}`)) return;
    } catch {
      return;
    }
    tourScheduled.current = true;
    const timer = setTimeout(() => startNextStep("onboarding"), 1500);
    return () => clearTimeout(timer);
  }, [isCreator, slug, startNextStep, currentTour]);

  // ?thread=<id> opens that post (links from notifications and the admin)
  // until it is closed.
  const threadParam = searchParams.get("thread");
  const [dismissedParam, setDismissedParam] = useState<string | null>(null);
  // Once the param is gone, the same link may open the post again.
  if (!threadParam && dismissedParam) setDismissedParam(null);
  const current =
    selected ??
    (threadParam && threadParam !== dismissedParam ? posts.find((p) => p.id === threadParam) ?? null : null);

  const closePost = useCallback(() => {
    setSelected(null);
    if (threadParam) {
      setDismissedParam(threadParam);
      router.replace(pathname, { scroll: false });
    }
  }, [threadParam, router, pathname]);

  const updatePost = useCallback(
    (id: string, patch: Partial<FeedPost> | ((p: FeedPost) => Partial<FeedPost>)) => {
      mutateThreads(
        (list) => (list ?? []).map((p) => (p.id === id ? { ...p, ...(typeof patch === "function" ? patch(p) : patch) } : p)),
        { revalidate: false }
      );
      setSelected((s) => (s && s.id === id ? { ...s, ...(typeof patch === "function" ? patch(s) : patch) } : s));
    },
    [mutateThreads]
  );

  const onLike = useCallback(
    (id: string, likesCount: number, liked: boolean) => {
      updatePost(id, (p) => {
        const others = (p.likes ?? []).filter((u) => u !== viewer.id);
        return { likesCount, likes: liked ? [...others, viewer.id] : others };
      });
    },
    [updatePost, viewer.id]
  );

  const onPosted = (raw: Record<string, unknown>, categoryName: string | null) => {
    const id = String(raw.id);
    const categoryId = (raw.category_id as string | null) ?? null;
    const post: FeedPost = {
      id,
      title: String(raw.title ?? ""),
      content: String(raw.content ?? ""),
      createdAt: String(raw.created_at ?? new Date().toISOString()),
      userId: viewer.id,
      category: categoryName ?? "General",
      categoryId,
      likesCount: 0,
      commentsCount: 0,
      likes: [],
      comments: [],
      pinned: !!raw.pinned,
      author: { name: viewer.name, image: viewer.avatarUrl ?? "" },
      lastReplyAt: null,
      repliers: [],
    };
    mutateThreads((list) => [post, ...(list ?? [])], { revalidate: false });
    setCategory(null);
    setSort("latest");
    setFreshId(id);
    toast.success(categoryName ? `Posted to ${categoryName}` : "Posted");
    requestAnimationFrame(() => document.getElementById(`post-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const applyMembership = (membership: MembershipStatus) => {
    setIsMember(membership.isMember);
    setMemberStatus(membership.status);
    setSubscriptionStatus(membership.subscriptionStatus);
    setAccessEndDate(membership.currentPeriodEnd);
    // Drop the cached copy of this page so going back doesn't show the old state.
    router.refresh();
  };

  const leave = async () => {
    try {
      const response = await fetch(`/api/community/${encodeURIComponent(slug)}/leave`, { method: "POST" });
      if (!response.ok) {
        const body = await failureBody(response);
        toast.error(body?.error || "Couldn't leave the community. Try again.");
        return;
      }
      const data = await response.json();
      if (data.gracePeriod && data.membership?.currentPeriodEnd) {
        applyMembership(data.membership);
        toast.success(`Your membership ends on ${formatDate(data.membership.currentPeriodEnd)}. You keep access until then.`);
      } else {
        setIsMember(false);
        toast.success("You left the community");
        router.push(communityPath(slug, "/about"));
      }
    } catch {
      toast.error("Couldn't leave the community. Try again.");
    }
  };

  const rejoin = async () => {
    try {
      const response = await fetch(`/api/community/${encodeURIComponent(slug)}/reactivate`, { method: "POST" });
      if (!response.ok) {
        const body = await failureBody(response);
        toast.error(body?.error || "Couldn't rejoin. Try again.");
        if (body?.membership && !body.membership.isMember) {
          // It already ended, so there is nothing to rejoin: join from scratch.
          setIsMember(false);
          router.push(communityPath(slug, "/about"));
        }
        return;
      }
      const data = await response.json();
      applyMembership(data.membership);
      toast.success("Welcome back. Your membership continues.");
    } catch {
      toast.error("Couldn't rejoin. Try again.");
    }
  };

  const cancelPreRegistration = async () => {
    try {
      const response = await fetch(`/api/community/${encodeURIComponent(slug)}/cancel-pre-registration`, { method: "POST" });
      if (!response.ok) throw new Error();
      toast.success("Pre-registration canceled");
      router.push(communityPath(slug, "/about"));
    } catch {
      toast.error("Couldn't cancel the pre-registration. Try again.");
    }
  };

  // People: the teacher first, then the roster.
  const people = useMemo<FeedPerson[]>(() => {
    const list: FeedPerson[] = [owner];
    for (const m of roster ?? []) {
      if (m.user_id === owner.id) continue;
      list.push({ id: m.user_id, name: m.profile?.full_name || "Member", avatarUrl: m.profile?.avatar_url || null });
    }
    return list;
  }, [owner, roster]);
  const memberCount = roster ? roster.length : initialMemberCount;

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of posts) if (p.categoryId) out[p.categoryId] = (out[p.categoryId] ?? 0) + 1;
    return out;
  }, [posts]);

  const pinned = useMemo(
    () =>
      category
        ? []
        : posts.filter((p) => p.pinned).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [posts, category]
  );
  const visible = useMemo(() => {
    const list = posts.filter((p) => (category ? p.categoryId === category : !p.pinned));
    return sortPosts(list, sort);
  }, [posts, category, sort]);

  if (isPreRegistered && !isMember) {
    return (
      <PreRegistrationComingSoon
        communityName={community.name}
        communitySlug={slug}
        openingDate={community.openingDate}
        membershipPrice={community.membershipPrice}
        onCancel={cancelPreRegistration}
      />
    );
  }
  if (!isMember && !isCreator && !isAdmin) return null;

  const openPost = (post: FeedPost, opts?: { focusReply?: boolean }) => {
    setFocusReply(!!opts?.focusReply);
    setSelected(post);
  };
  const postHref = (p: FeedPost) => communityPath(slug, `/threads/${p.id}`);
  const card = (p: FeedPost, embedded = false) => (
    <div id={`post-${p.id}`}>
      <PostCard
        post={p}
        href={postHref(p)}
        category={p.categoryId ? categoriesById.get(p.categoryId) : undefined}
        isTeacher={p.userId === community.createdBy}
        isNew={isNewPost(p, newSince, viewer.id)}
        fresh={p.id === freshId}
        viewerId={viewer.id}
        now={now}
        timeZone={timeZone}
        onOpen={openPost}
        onLike={onLike}
        embedded={embedded}
      />
    </div>
  );

  const activeCategory = category ? categoriesById.get(category) : undefined;
  const lockedCategory = !!activeCategory?.creatorOnly && !isCreator;
  const announceCategory = community.categories.find((c) => c.creatorOnly);
  const paid = community.membershipEnabled && community.membershipPrice > 0;

  const nextClass = offerings.liveClasses ? (
    <NextClassCard slug={slug} classes={upcomingClasses} now={now} timeZone={timeZone} isOwner={isCreator} />
  ) : null;
  const course = offerings.courses && courseProgress ? <CourseCard slug={slug} progress={courseProgress} /> : null;
  const secondary = (
    <>
      {offerings.privateLessons && lessons.length > 0 && (
        <LessonsCard slug={slug} lessons={lessons} teacherName={owner.name} isMember={isMember} />
      )}
      {isCreator ? (
        <OwnerTools
          slug={slug}
          showSchedule={offerings.liveClasses}
          onAnnounce={() => composer.current?.open({ categoryId: announceCategory?.id })}
        />
      ) : isMember ? (
        <MembershipCard
          communityName={community.name}
          paid={paid}
          subscriptionStatus={subscriptionStatus}
          accessEndDate={accessEndDate}
          canManageBilling={!!community.stripeAccountId}
          timeZone={timeZone}
          onManageBilling={() => setShowManageModal(true)}
          onLeave={leave}
          onRejoin={rejoin}
        />
      ) : (
        <AdminJoinCard slug={slug} />
      )}
      {community.customLinks.length > 0 && <LinksCard links={community.customLinks} />}
    </>
  );

  let feed: React.ReactNode;
  if (posts.length === 0 && threadsError) {
    feed = (
      <FeedError
        title="Posts didn't load"
        text="The connection dropped while loading the feed. Your classes and membership are fine."
        onRetry={() => mutateThreads()}
      />
    );
  } else if (posts.length === 0) {
    feed = isCreator ? (
      <FeedEmpty
        icon="megaphone"
        title="Say hello to your first members"
        text="A welcome post tells new members where to start: when classes happen, where replays live, and how to ask for feedback."
        primary={{
          label: "Write a welcome post",
          onClick: () => composer.current?.open({ title: WELCOME_TITLE, body: WELCOME_BODY, categoryId: announceCategory?.id }),
        }}
      />
    ) : (
      <FeedEmpty
        title="No posts yet"
        text="Introduce yourself, ask a question about a class, or share what you're working on."
        primary={{ label: "Write the first post", onClick: () => composer.current?.open() }}
      />
    );
  } else {
    feed = (
      <>
        {pinned.length > 0 && (
          <PinnedBox slug={slug} posts={pinned} ownerName={owner.name} onOpen={openPost} renderPost={(p) => card(p, true)} />
        )}
        {visible.length === 0 ? (
          <FeedEmpty
            title={`No posts in ${activeCategory?.name ?? "this topic"} yet`}
            text={lockedCategory ? `${owner.name} posts here. Check back soon.` : "Start the first one. It shows up at the top for everyone following this topic."}
            primary={lockedCategory ? undefined : { label: "Start a post", onClick: () => composer.current?.open({ categoryId: category ?? undefined }) }}
            secondary={{ label: "See all posts", onClick: () => setCategory(null) }}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map((p) => (
              <div key={p.id}>{card(p)}</div>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-[1160px] px-4 pb-12 pt-3 sm:px-6 sm:pb-[72px] sm:pt-5">
        <FeedHeader
          community={community}
          people={people}
          memberCount={memberCount}
          rosterLoaded={!!roster}
          viewerId={viewer.id}
          isOwner={isCreator}
        />

        <div className="mt-4 grid grid-cols-1 items-start gap-8 min-[1080px]:mt-6 min-[1080px]:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-4">
            {(nextClass || course) && (
              <div
                aria-label="Up next"
                className="scrollbar-hide -m-1 grid snap-x snap-mandatory auto-cols-[86%] grid-flow-col gap-3 overflow-x-auto p-1 pb-1 sm:auto-cols-[minmax(280px,1fr)] min-[1080px]:hidden"
              >
                {nextClass && <div className="snap-start">{nextClass}</div>}
                {course && (
                  <div className="snap-start">
                    <CourseCard slug={slug} progress={courseProgress!} card />
                  </div>
                )}
              </div>
            )}

            <Composer
              ref={composer}
              communityId={community.id}
              categories={community.categories}
              viewer={viewer}
              isOwner={isCreator}
              ownerName={owner.name}
              onPosted={onPosted}
            />

            <FilterBar
              categories={community.categories}
              counts={counts}
              total={posts.length}
              selected={category}
              onSelect={setCategory}
              sort={sort}
              onSort={setSort}
            />

            {feed}

            <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-7 border-t border-line pt-6 min-[1080px]:hidden">
              {secondary}
            </div>
          </div>

          <aside aria-label="Classes, learning and membership" className="hidden flex-col gap-7 min-[1080px]:flex">
            {nextClass}
            {course}
            {secondary}
          </aside>
        </div>
      </div>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} posts={posts} onPick={openPost} />

      {current && (
        <ThreadModal
          thread={{
            id: current.id,
            user_id: current.userId,
            title: current.title,
            content: current.content,
            author: current.author,
            created_at: current.createdAt,
            likes_count: current.likesCount,
            comments_count: current.commentsCount,
            category: (current.categoryId && categoriesById.get(current.categoryId)?.name) || "General",
            category_type: current.categoryId ? categoriesById.get(current.categoryId)?.iconType : undefined,
            likes: current.likes,
            comments: [],
            pinned: current.pinned,
          }}
          isOpen
          onClose={closePost}
          onLikeUpdate={onLike}
          onCommentUpdate={(id) =>
            updatePost(id, (p) => ({
              commentsCount: p.commentsCount + 1,
              lastReplyAt: new Date().toISOString(),
              repliers: [
                { id: viewer.id, name: viewer.name, image: viewer.avatarUrl ?? "" },
                ...(p.repliers ?? []).filter((r) => r.id !== viewer.id),
              ].slice(0, 3),
            }))
          }
          onThreadUpdate={(id, updates) => {
            const patch: Partial<FeedPost> = {};
            if (updates.title !== undefined) patch.title = updates.title;
            if (updates.content !== undefined) patch.content = updates.content;
            if (updates.pinned !== undefined) patch.pinned = updates.pinned;
            if (updates.comments_count !== undefined) {
              // A nested reply: same bookkeeping as a top-level one.
              patch.commentsCount = updates.comments_count;
              patch.lastReplyAt = new Date().toISOString();
            }
            updatePost(id, patch);
          }}
          onDelete={(id) => {
            mutateThreads((list) => (list ?? []).filter((p) => p.id !== id), { revalidate: false });
            setSelected(null);
          }}
          isCreator={isCreator}
          categoryColor={current.categoryId ? categoriesById.get(current.categoryId)?.color : undefined}
          teacherId={community.createdBy}
          autoFocusReply={focusReply}
        />
      )}

      {community.stripeAccountId && (
        <ManageSubscriptionModal
          isOpen={showManageModal}
          onClose={() => setShowManageModal(false)}
          communitySlug={slug}
          stripeAccountId={community.stripeAccountId}
        />
      )}
    </>
  );
}
