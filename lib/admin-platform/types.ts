// Types shared across the platform-wide admin dashboard (`/admin`).
// Sibling of lib/admin-dashboard/types.ts which lives in the
// community-owner admin (`/[communitySlug]/admin`).

export interface PlatformStats {
  usersTotal: number;
  newUsersThisMonth: number;
  newUsersGrowth: number;
  communitiesTotal: number;
  newCommunitiesThisMonth: number;
  newCommunitiesGrowth: number;
  activeSubscriptions: number;
  activeSubscriptionsGrowth: number;
  platformRevenueThisMonth: number;
  platformRevenueGrowth: number;
  communitiesRevenueThisMonth: number;
  communitiesRevenueGrowth: number;
}

// One bar group per month: total community revenue (gross) and the
// platform's slice (application fees) plotted side-by-side.
export type PlatformRevenuePoint = {
  month: string;
  total: number;
  platformFees: number;
};

// One point per day. Two series share the x-axis on the same chart.
export type PlatformGrowthPoint = {
  date: string;
  users: number;
  communities: number;
};

export type PlatformActivityEvent =
  | {
      type: 'signup';
      at: Date;
      userId: string;
      displayName: string;
      avatarUrl: string | null;
    }
  | {
      type: 'community_created';
      at: Date;
      userId: string;
      displayName: string;
      avatarUrl: string | null;
      communityName: string;
      communitySlug: string;
    }
  | {
      type: 'admin_action';
      at: Date;
      action: string;
      resourceType: string;
      adminName: string | null;
    }
  | {
      type: 'failed_payment';
      at: Date;
      displayName: string;
      amount: number;
      communitySlug: string | null;
    };
