"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import toast from "react-hot-toast";
import PaymentModal from "@/components/PaymentModal";
import { PreRegistrationPaymentModal } from "@/components/PreRegistrationPaymentModal";
import { PreRegistrationComingSoon } from "@/components/PreRegistrationComingSoon";
import Thread from "@/components/Thread";
import ThreadModal from "@/components/ThreadModal";
import CommunityHeader from "@/components/community/CommunityHeader";
import ComposerBox from "@/components/community/ComposerBox";
import CategoryPills from "@/components/community/CategoryPills";
import ThreadCardFluid from "@/components/community/ThreadCardFluid";
import CommunitySidebar from "@/components/community/CommunitySidebar";
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
import { ThreadCategory } from "@/types/community";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { useNextStep } from "nextstepjs";
import { useIsMobile } from "@/hooks/use-is-mobile";

interface CustomLink {
  title: string;
  url: string;
}

interface Thread {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  userId: string;
  likesCount: number;
  commentsCount: number;
  category?: string;
  categoryId?: string;
  category_type?: string;
  author: {
    name: string;
    image: string;
  };
  likes?: string[];
  comments?: any[];
  pinned?: boolean;
}

interface Member {
  id: string;
  user_id: string;
  community_id: string;
  role: string;
  created_at: string;
  status?: string | null;
  subscription_status?: string | null;
  current_period_end?: string | null;
  profile?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    display_name: string | null;
  };
}

interface Community {
  id: string;
  name: string;
  slug: string;
  description: string;
  image_url: string;
  created_by: string;
  created_at: string;
  membersCount: number;
  createdBy: string;
  imageUrl: string;
  imageFocalX?: number;
  imageFocalY?: number;
  imageZoom?: number;
  customLinks?: CustomLink[];
  membershipEnabled?: boolean;
  membershipPrice?: number;
  membership_price?: number;
  threadCategories?: ThreadCategory[];
  stripeAccountId?: string | null;
  status?: 'active' | 'pre_registration' | 'inactive';
  opening_date?: string | null;
}

interface FeedClientProps {
  communitySlug: string;
  initialCommunity: Community;
  initialThreads: Thread[];
  isCreator: boolean;
  isAdmin: boolean;
  isMember: boolean;
  isPreRegistered: boolean;
  memberStatus: string | null;
  subscriptionStatus: string | null;
  accessEndDate: string | null;
}

export default function FeedClient({
  communitySlug,
  initialCommunity,
  initialThreads,
  isCreator,
  isAdmin,
  isMember: initialIsMember,
  isPreRegistered: initialIsPreRegistered,
  memberStatus: initialMemberStatus,
  subscriptionStatus: initialSubscriptionStatus,
  accessEndDate: initialAccessEndDate,
}: FeedClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const { user: currentUser } = useAuth();

  // SWR keeps community / members / threads fresh in the background. We seed
  // it with initialCommunity / initialThreads so the first paint never
  // duplicates the server fetch — and skip a redundant /community for members
  // since SSR didn't provide them.
  const {
    data: communityData,
    error: communityError,
  } = useSWR<Community>(
    communitySlug ? `community:${communitySlug}` : null,
    fetcher,
    { fallbackData: initialCommunity }
  );

  const {
    data: membersData,
    error: membersError,
  } = useSWR<Member[]>(
    communitySlug ? `community-members:${communitySlug}` : null,
    fetcher
  );

  const {
    data: threadsData,
    error: threadsError,
  } = useSWR<Thread[]>(
    communitySlug ? `community-threads:${communitySlug}` : null,
    fetcher,
    { fallbackData: initialThreads }
  );

  const [community, setCommunity] = useState<Community | null>(initialCommunity);
  const [members, setMembers] = useState<Member[]>([]);
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [isMember, setIsMember] = useState(initialIsMember);
  const [isPreRegistered, setIsPreRegistered] = useState(initialIsPreRegistered);
  const [error, setError] = useState<Error | null>(null);
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(
    null
  );
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPreRegistrationModal, setShowPreRegistrationModal] = useState(false);
  const [preRegistrationClientSecret, setPreRegistrationClientSecret] = useState<string | null>(null);
  const [preRegistrationOpeningDate, setPreRegistrationOpeningDate] = useState<string | null>(null);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [isWriting, setIsWriting] = useState(false);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Open a thread automatically when the URL carries ?thread=<id> (used by the
  // admin activity-feed link). On mobile we route to the dedicated page since
  // that's the existing pattern for thread navigation on small screens.
  useEffect(() => {
    const threadId = searchParams.get('thread');
    if (!threadId) return;
    if (selectedThread?.id === threadId) return;
    const thread = threads.find((t) => t.id === threadId);
    if (!thread) return;
    if (isMobile) {
      router.replace(`/${communitySlug}/threads/${thread.id}`);
    } else {
      setSelectedThread(thread);
    }
  }, [searchParams, threads, selectedThread, isMobile, router, communitySlug]);

  // Once the modal is closed by the user, drop ?thread=<id> from the URL so
  // a refresh / back-button doesn't immediately reopen it.
  useEffect(() => {
    if (selectedThread !== null) return;
    if (!searchParams.get('thread')) return;
    router.replace(pathname);
  }, [selectedThread, searchParams, router, pathname]);
  const [totalMembers, setTotalMembers] = useState(0);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [accessEndDate, setAccessEndDate] = useState<string | null>(initialAccessEndDate);
  const [memberStatus, setMemberStatus] = useState<string | null>(initialMemberStatus);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(initialSubscriptionStatus);

  const { startNextStep, currentTour } = useNextStep();

  // Schedule the onboarding tour for creators once per mount. Ref-guard so a
  // FeedClient remount doesn't restart the tour mid-flight (the tour can route
  // the user back through this page).
  const tourScheduledRef = useRef(false);
  useEffect(() => {
    if (!isCreator) return;
    if (tourScheduledRef.current) return;
    if (currentTour === 'onboarding') return;

    const tourKey = `onboarding-tour-completed-${communitySlug}`;
    if (localStorage.getItem(tourKey)) return;

    tourScheduledRef.current = true;
    const timer = setTimeout(() => {
      startNextStep('onboarding');
    }, 1500);
    return () => clearTimeout(timer);
  }, [isCreator, communitySlug, startNextStep, currentTour]);

  // Update community state when SWR data changes
  useEffect(() => {
    if (communityData) {
      setCommunity(communityData);
      setStripeAccountId(communityData.stripeAccountId || null);
    }
  }, [communityData]);

  // Update error state when SWR error occurs
  useEffect(() => {
    if (communityError) {
      setError(
        communityError instanceof Error
          ? communityError
          : new Error("Failed to fetch community")
      );
    }
  }, [communityError]);

  // Update members state when SWR data changes
  useEffect(() => {
    if (membersData) {
      setMembers(membersData);
      setTotalMembers(membersData.length);
    }
  }, [membersData]);

  // Update error state when SWR error occurs
  useEffect(() => {
    if (membersError) {
      setError(
        membersError instanceof Error
          ? membersError
          : new Error("Failed to fetch members")
      );
    }
  }, [membersError]);

  // Update threads state when SWR data changes
  useEffect(() => {
    if (threadsData) {
      setThreads(threadsData);
    }
  }, [threadsData]);

  // Update error state when SWR error occurs
  useEffect(() => {
    if (threadsError) {
      setError(
        threadsError instanceof Error
          ? threadsError
          : new Error("Failed to fetch threads")
      );
    }
  }, [threadsError]);

  // Membership / creator / admin / pre-registered checks happen server-side in
  // page.tsx and arrive as initial props. SWR refreshes community / members /
  // threads above; the manual mirror useEffects sync those caches into local
  // state so existing code keeps working.

  // Mirror SWR membersData into the current user's membership status.
  useEffect(() => {
    if (!membersData || !currentUser) return;
    const currentMember = membersData.find((m) => m.user_id === currentUser.id);
    if (!currentMember) return;
    setMemberStatus(currentMember.status ?? null);
    setSubscriptionStatus(currentMember.subscription_status ?? null);
    if (currentMember.current_period_end) {
      setAccessEndDate(currentMember.current_period_end);
    }
  }, [membersData, currentUser]);

  const handleJoinCommunity = async () => {
    if (!currentUser) {
      toast.error("Please sign in to join the community");
      return;
    }

    try {
      // Check if community is in pre-registration mode
      if (community?.status === 'pre_registration') {
        // Handle pre-registration
        const response = await fetch(
          `/api/community/${communitySlug}/join-pre-registration`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userId: currentUser.id,
              email: currentUser.email,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to create pre-registration");
        }

        const { clientSecret, stripeAccountId, openingDate } = await response.json();
        setPreRegistrationClientSecret(clientSecret);
        setStripeAccountId(stripeAccountId);
        setPreRegistrationOpeningDate(openingDate);
        setShowPreRegistrationModal(true);
      } else if (
        community?.membershipEnabled &&
        community?.membershipPrice &&
        community.membershipPrice > 0
      ) {
        // Handle paid membership
        const response = await fetch(
          `/api/community/${communitySlug}/join-paid`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userId: currentUser.id,
              email: currentUser.email,
            }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to create payment");
        }

        const { clientSecret, stripeAccountId } = await response.json();
        setPaymentClientSecret(clientSecret);
        setStripeAccountId(stripeAccountId);
        setShowPaymentModal(true);
      } else {
        // Handle free membership
        const response = await fetch(`/api/community/${communitySlug}/join`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: currentUser.id }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error("Join community error:", errorData);
          throw new Error(errorData.error || "Failed to join community");
        }

        const data = await response.json();
        setIsMember(true);
        setTotalMembers((prev) => prev + 1);
        toast.success("Successfully joined the community!");
      }
    } catch (error) {
      console.error("Error joining community:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to join community"
      );
    }
  };

  const handleLeaveCommunity = async () => {
    if (!currentUser) return;

    try {
      const response = await fetch(`/api/community/${communitySlug}/leave`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: currentUser.id }),
      });

      if (!response.ok) {
        throw new Error("Failed to leave community");
      }

      const data = await response.json();

      // Update local state
      if (data.gracePeriod && data.accessEndDate) {
        setAccessEndDate(data.accessEndDate);
        const endDate = new Date(data.accessEndDate).toLocaleDateString();
        toast.success(
          `Your membership will end on ${endDate}. You'll maintain access until then.`
        );
      } else {
        setIsMember(false);
        setMembers((prev) =>
          prev.filter((member) => member.user_id !== currentUser.id)
        );
        toast.success("Successfully left the community");
        setShowLeaveDialog(false);
        router.push(`/${communitySlug}/about`);
        return;
      }

      setShowLeaveDialog(false);
    } catch (error) {
      console.error("Error leaving community:", error);
      toast.error("Failed to leave community");
    }
  };

  const handleReactivateMembership = async () => {
    if (!currentUser) return;

    try {
      const response = await fetch(
        `/api/community/${communitySlug}/reactivate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: currentUser.id }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to reactivate membership");
      }

      const data = await response.json();

      // Update local state
      setMemberStatus("active");
      setSubscriptionStatus("active");
      setAccessEndDate(null);
      toast.success("Your membership has been reactivated!");
    } catch (error) {
      console.error("Error reactivating membership:", error);
      toast.error("Failed to reactivate membership");
    }
  };

  const handleNewThread = async (newThread: any) => {
    // /api/threads/create returns DB-shaped fields (category_id), so accept
    // both casings here.
    const categoryId = newThread.categoryId ?? newThread.category_id;
    const selectedCategory = community?.threadCategories?.find(
      (cat) => cat.id === categoryId
    );

    const threadWithAuthor = {
      ...newThread,
      author: newThread.author || {
        name: currentUser?.name || "Anonymous",
        image: currentUser?.image || "",
      },
      categoryId,
      category: selectedCategory?.name || "General",
      category_type: selectedCategory?.iconType,
      createdAt: newThread.createdAt || new Date().toISOString(),
      likesCount: 0,
      commentsCount: 0,
      likes: [],
      comments: [],
    };

    setThreads((prevThreads) => [threadWithAuthor, ...prevThreads]);
    setIsWriting(false);
  };

  const handleLikeUpdate = (
    threadId: string,
    newLikesCount: number,
    liked: boolean
  ) => {
    setThreads((prevThreads) =>
      prevThreads.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              likesCount: newLikesCount,
              likes: liked
                ? [...(thread.likes || []), currentUser!.id]
                : (thread.likes || []).filter((id) => id !== currentUser!.id),
            }
          : thread
      )
    );

    if (selectedThread?.id === threadId) {
      setSelectedThread((prev) =>
        prev
          ? {
              ...prev,
              likesCount: newLikesCount,
              likes: liked
                ? [...(prev.likes || []), currentUser!.id]
                : (prev.likes || []).filter((id) => id !== currentUser!.id),
            }
          : null
      );
    }
  };

  const handleCommentUpdate = (threadId: string, newComment: any) => {
    setThreads((prevThreads) =>
      prevThreads.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              commentsCount: thread.commentsCount + 1,
              comments: [...(thread.comments || []), newComment],
            }
          : thread
      )
    );

    if (selectedThread?.id === threadId) {
      setSelectedThread((prev) =>
        prev
          ? {
              ...prev,
              commentsCount: prev.commentsCount + 1,
              comments: [...(prev.comments || []), newComment],
            }
          : null
      );
    }
  };

  const filteredThreads = useMemo(() => {
    let filtered = [...threads];

    // Apply category filter
    if (selectedCategory) {
      filtered = filtered.filter(
        (thread) => thread.categoryId === selectedCategory
      );
    }

    // Sort pinned threads first, then by creation date
    return filtered.sort((a, b) => {
      // First sort by pinned status
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      // Then sort by creation date (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [threads, selectedCategory]);

  const categoriesById = useMemo(() => {
    const map = new Map<string, ThreadCategory>();
    for (const cat of community?.threadCategories ?? []) {
      map.set(cat.id, cat);
    }
    return map;
  }, [community?.threadCategories]);

  const handleCancelPreRegistration = async () => {
    if (!currentUser || !community) return;

    try {
      const response = await fetch(`/api/community/${communitySlug}/cancel-pre-registration`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: currentUser.id }),
      });

      if (!response.ok) {
        throw new Error('Failed to cancel pre-registration');
      }

      toast.success('Pre-registration cancelled successfully');
      router.push(`/${communitySlug}/about`);
    } catch (error) {
      console.error('Error cancelling pre-registration:', error);
      toast.error('Failed to cancel pre-registration');
    }
  };

  if (error) {
    return <div>Error loading community: {error.message}</div>;
  }

  if (!community) {
    return (
      <div className="flex justify-center items-center py-16">
        <div>Community not found</div>
      </div>
    );
  }

  // Show coming soon page for pre-registered members
  if (isPreRegistered && community.opening_date) {
    return (
      <PreRegistrationComingSoon
        communityName={community.name}
        communitySlug={communitySlug}
        openingDate={community.opening_date}
        membershipPrice={community.membership_price || 0}
        onCancel={handleCancelPreRegistration}
      />
    );
  }

  // Only show main content for active members. Creators and site admins
  // also have access (server-side gate already let them through; mirror that
  // here so they don't see a blank page).
  if (!isMember && !isCreator && !isAdmin) {
    return null;
  }

  // Get current user info for composer
  const currentUserMember = members.find((m) => m.user_id === currentUser?.id);
  const currentUserAvatar = currentUserMember?.profile?.avatar_url || currentUser?.image || "";
  const currentUserName = currentUserMember?.profile?.display_name || currentUserMember?.profile?.full_name || currentUser?.name || "User";

  const handleThreadClick = (thread: Thread) => {
    if (isMobile) {
      router.push(`/${communitySlug}/threads/${thread.id}`);
    } else {
      setSelectedThread(thread);
    }
  };

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Curved Community Header */}
          <CommunityHeader
            name={community.name}
            description={community.description}
            imageUrl={community.imageUrl}
            imageFocalX={community.imageFocalX}
            imageFocalY={community.imageFocalY}
            imageZoom={community.imageZoom}
            membersCount={totalMembers}
            members={members}
            isCreator={isCreator}
            onManageClick={() => router.push(`/${communitySlug}/admin`)}
          />

          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
            {/* Main Content Area */}
            <div className="flex-1 min-w-0">
              {/* Composer Box */}
              <div id="write-post" className="mb-6">
                {isWriting ? (
                  <div className="bg-card rounded-2xl p-4 shadow-sm border border-border/50">
                    <Thread
                      communityId={community.id}
                      userId={currentUser?.id || ""}
                      communityName={community.name}
                      community={community}
                      onSave={handleNewThread}
                      onCancel={() => setIsWriting(false)}
                    />
                  </div>
                ) : (
                  <ComposerBox
                    userAvatar={currentUserAvatar}
                    userName={currentUserName}
                    onClick={() =>
                      currentUser
                        ? setIsWriting(true)
                        : toast.error("Please sign in to post")
                    }
                    disabled={!currentUser}
                  />
                )}
              </div>

              {/* Categories filter */}
              {community.threadCategories &&
                community.threadCategories.length > 0 && (
                  <div id="thread-categories">
                    <CategoryPills
                      categories={community.threadCategories}
                      selectedCategory={selectedCategory}
                      onSelectCategory={setSelectedCategory}
                    />
                  </div>
                )}

              {/* Threads list */}
              <div className="space-y-4">
                {filteredThreads.map((thread) => {
                  const cat = thread.categoryId
                    ? categoriesById.get(thread.categoryId)
                    : undefined;
                  return (
                    <ThreadCardFluid
                      key={thread.id}
                      id={thread.id}
                      title={thread.title}
                      content={thread.content}
                      author={thread.author}
                      created_at={thread.createdAt}
                      likes_count={thread.likesCount}
                      comments_count={thread.commentsCount}
                      category={cat?.name || "General"}
                      category_type={cat?.iconType}
                      likes={thread.likes}
                      pinned={thread.pinned}
                      onClick={() => handleThreadClick(thread)}
                      onLikeUpdate={handleLikeUpdate}
                    />
                  );
                })}
                {filteredThreads.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <p className="text-lg font-medium mb-2">No threads yet</p>
                    <p className="text-sm">Be the first to start a conversation!</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Sidebar */}
            <div className="w-full lg:w-72 flex-shrink-0">
              <CommunitySidebar
                customLinks={community.customLinks || []}
                communitySlug={communitySlug}
                creatorId={community.created_by}
                isMember={isMember}
                isCreator={isCreator}
                memberStatus={memberStatus}
                subscriptionStatus={subscriptionStatus}
                accessEndDate={accessEndDate}
                membershipPrice={community.membershipPrice}
                membershipEnabled={community.membershipEnabled}
                stripeAccountId={community.stripeAccountId}
                onLeaveClick={() => setShowLeaveDialog(true)}
                onReactivateClick={handleReactivateMembership}
                onJoinClick={handleJoinCommunity}
              />
            </div>
          </div>
        </div>

      {/* Modals */}
      {selectedThread && (() => {
        const cat = selectedThread.categoryId
          ? categoriesById.get(selectedThread.categoryId)
          : undefined;
        return (
        <ThreadModal
          thread={{
            id: selectedThread.id,
            user_id: selectedThread.userId,
            title: selectedThread.title,
            content: selectedThread.content,
            author: selectedThread.author,
            created_at: selectedThread.createdAt,
            likes_count: selectedThread.likesCount,
            comments_count: selectedThread.commentsCount,
            category: cat?.name || "General",
            category_type: cat?.iconType,
            likes: selectedThread.likes,
            comments: selectedThread.comments,
            pinned: selectedThread.pinned,
          }}
          isOpen={!!selectedThread}
          onClose={() => setSelectedThread(null)}
          onLikeUpdate={handleLikeUpdate}
          onCommentUpdate={handleCommentUpdate}
          onThreadUpdate={(threadId, updates) => {
            setThreads((prevThreads) =>
              prevThreads.map((thread) =>
                thread.id === threadId ? { ...thread, ...updates } : thread
              )
            );
            setSelectedThread((prev) =>
              prev && prev.id === threadId ? { ...prev, ...updates } : prev
            );
          }}
          onDelete={(threadId) => {
            setThreads((prevThreads) =>
              prevThreads.filter((thread) => thread.id !== threadId)
            );
            setSelectedThread(null);
          }}
          isCreator={currentUser?.id === community.created_by}
        />
        );
      })()}

      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        clientSecret={paymentClientSecret}
        stripeAccountId={stripeAccountId}
        price={community.membershipPrice || 0}
        onSuccess={() => {
          setIsMember(true);
          setShowPaymentModal(false);
          toast.success("Successfully joined the community!");
        }}
        communitySlug={communitySlug}
      />

      <PreRegistrationPaymentModal
        isOpen={showPreRegistrationModal}
        onClose={() => setShowPreRegistrationModal(false)}
        clientSecret={preRegistrationClientSecret || ''}
        stripeAccountId={stripeAccountId || ''}
        communitySlug={communitySlug}
        communityName={community.name}
        price={community.membershipPrice || 0}
        openingDate={preRegistrationOpeningDate || ''}
        onSuccess={() => {
          setIsPreRegistered(true);
          setShowPreRegistrationModal(false);
          toast.success("Pre-registration successful! You'll be charged on the opening date.");
        }}
      />

      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Community</AlertDialogTitle>
            <AlertDialogDescription>
              {community?.membershipEnabled &&
              community?.membershipPrice &&
              community?.membershipPrice > 0 ? (
                <>
                  Your subscription will be canceled, but you'll maintain access
                  until the end of your current billing period.
                  {accessEndDate && (
                    <p className="mt-2 text-sm font-medium text-yellow-600">
                      You will have access until{" "}
                      {new Date(accessEndDate).toLocaleDateString()}
                    </p>
                  )}
                </>
              ) : (
                "Are you sure you want to leave this community? You'll lose access to all content and need to rejoin to access it again."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeaveCommunity}
              className="bg-red-500 hover:bg-red-600"
            >
              Leave Community
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
