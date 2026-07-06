/**
 * SWR Fetcher - Uses API routes instead of direct database access
 * Migrated from Supabase to Better Auth + Neon architecture
 */

async function fetchJson<T = unknown>(
  url: string,
  errorMessage: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...init });
  if (!response.ok) {
    throw new Error(errorMessage);
  }
  return response.json();
}

export const fetcher = async (key: string) => {
  const [resource, ...params] = key.split(':');

  if (resource === 'community') {
    const slug = params[0];
    const data: any = await fetchJson(
      `/api/community/${slug}`,
      'Failed to fetch community'
    );
    return {
      ...data,
      imageUrl: data.image_url,
      threadCategories: Array.isArray(data.thread_categories) ? data.thread_categories : [],
      customLinks: Array.isArray(data.custom_links) ? data.custom_links : [],
      membershipEnabled: data.membership_enabled || false,
      membershipPrice: data.membership_price || 0,
      yearlyEnabled: data.yearly_enabled || false,
      yearlyPrice: Number(data.yearly_price ?? 0),
      yearlyBenefits: data.yearly_benefits ?? "",
      stripeAccountId: data.stripe_account_id || null,
    };
  }

  if (resource === 'community-members') {
    const communitySlug = params[0];
    const data: any = await fetchJson(
      `/api/community/${communitySlug}/members`,
      'Failed to fetch members'
    );
    return (data.members || []).map((member: any) => ({
      ...member,
      profile: {
        id: member.user_id,
        full_name: member.displayName || "Anonymous",
        avatar_url: member.imageUrl,
      },
    }));
  }

  if (resource === 'community-threads') {
    const communitySlug = params[0];
    return fetchJson(
      `/api/community/${communitySlug}/threads`,
      'Failed to fetch threads'
    );
  }

  if (key === 'communities') {
    return fetchJson('/api/communities', 'Failed to fetch communities');
  }

  if (resource === 'communities') {
    const userId = params[0];
    return fetchJson(
      `/api/communities?userId=${userId}`,
      'Failed to fetch communities'
    );
  }

  if (resource === 'user-communities') {
    const userId = params[0];
    return fetchJson(
      `/api/user/${userId}/communities`,
      'Failed to fetch user communities'
    );
  }

  if (resource === 'profile') {
    const userId = params[0];
    return fetchJson(`/api/profile?userId=${userId}`, 'Failed to fetch profile');
  }

  if (resource === 'course') {
    const [communitySlug, courseSlug] = params;
    return fetchJson(
      `/api/community/${communitySlug}/courses/${courseSlug}`,
      'Failed to fetch course',
      { cache: 'no-store' }
    );
  }

  // Fallback: treat any URL-like key as a direct fetch
  if (key.startsWith('/')) {
    return fetchJson(key, `Failed to fetch ${key}`);
  }

  throw new Error(`No fetcher defined for key ${key}`);
};

// Types
export interface Community {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  membersCount?: number;
  members_count?: number;
  privacy?: string;
  slug: string;
  created_at: string;
  created_by: string;
  threadCategories?: ThreadCategory[];
  customLinks?: CustomLink[];
  membershipEnabled?: boolean;
  membershipPrice?: number;
  yearlyEnabled?: boolean;
  yearlyPrice?: number;
  yearlyBenefits?: string;
  stripeAccountId?: string | null;
  isMember?: boolean;
  status?: 'active' | 'pre_registration' | 'inactive';
  opening_date?: string | null;
}

export interface ThreadCategory {
  id: string;
  name: string;
  iconType?: string;
}

export interface CustomLink {
  title: string;
  url: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  display_name?: string | null;
}
