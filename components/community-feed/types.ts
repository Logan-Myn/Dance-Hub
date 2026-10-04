import type { CommunityThread, CourseProgress, UpcomingClass } from "@/lib/community-data";
import type { ThreadCategory } from "@/types/community";

export type FeedPost = CommunityThread;
export type { CourseProgress, ThreadCategory, UpcomingClass };

export interface FeedPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface FeedViewer extends FeedPerson {
  timezone: string | null;
}

export interface FeedCommunity {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  createdBy: string;
  imageUrl: string | null;
  imageFocalX: number;
  imageFocalY: number;
  imageZoom: number;
  categories: ThreadCategory[];
  customLinks: Array<{ title: string; url: string }>;
  membershipEnabled: boolean;
  membershipPrice: number;
  yearlyEnabled: boolean;
  stripeAccountId: string | null;
  status: string | null;
  openingDate: string | null;
}

export interface FeedLesson {
  id: string;
  title: string;
  durationMinutes: number;
  locationType: "online" | "in_person" | "both";
  regularPrice: number;
  memberPrice: number | null;
}

export interface RosterMember {
  user_id: string;
  role?: string;
  profile?: { full_name: string | null; avatar_url: string | null };
}
