import { query } from '@/lib/db';

export interface AdminThreadRow {
  id: string;
  title: string;
  contentPreview: string;
  createdAt: Date;
  community: {
    id: string;
    name: string;
    slug: string;
  };
  author: {
    fullName: string | null;
    email: string;
    avatarUrl: string | null;
  };
  repliesCount: number;
  reportsCount: number;
}

interface ThreadRow {
  id: string;
  title: string;
  content: string;
  created_at: Date;
  community_id: string;
  created_by: string;
  comments_count: number | null;
}

interface CommunityRow {
  id: string;
  name: string;
  slug: string;
}

interface AuthorRow {
  auth_user_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

interface ReportCountRow {
  thread_id: string;
  count: number;
}

export async function getAllAdminThreads(): Promise<AdminThreadRow[]> {
  const threads = await query<ThreadRow>`
    SELECT id, title, content, created_at, community_id, created_by,
           comments_count
    FROM threads
    ORDER BY created_at DESC
  `;
  if (threads.length === 0) return [];

  const communityIds = Array.from(new Set(threads.map((t) => t.community_id)));
  const authorIds = Array.from(new Set(threads.map((t) => t.created_by)));
  const threadIds = threads.map((t) => t.id);

  const [communities, authors, reportCounts] = await Promise.all([
    query<CommunityRow>`
      SELECT id, name, slug
      FROM communities
      WHERE id = ANY(${communityIds})
    `,
    query<AuthorRow>`
      SELECT auth_user_id, full_name, email, avatar_url
      FROM profiles
      WHERE auth_user_id = ANY(${authorIds})
    `,
    query<ReportCountRow>`
      SELECT thread_id, COUNT(*)::int AS count
      FROM thread_reports
      WHERE thread_id = ANY(${threadIds})
      GROUP BY thread_id
    `,
  ]);

  const communityMap = new Map(communities.map((c) => [c.id, c]));
  const authorMap = new Map(authors.map((a) => [a.auth_user_id, a]));
  const reportCountMap = new Map(reportCounts.map((r) => [r.thread_id, r.count]));

  return threads.map((t) => {
    const community = communityMap.get(t.community_id);
    const author = authorMap.get(t.created_by);
    return {
      id: t.id,
      title: t.title,
      contentPreview: stripHtml(t.content).slice(0, 240),
      createdAt: new Date(t.created_at),
      community: community
        ? { id: community.id, name: community.name, slug: community.slug }
        : { id: t.community_id, name: 'Unknown', slug: '' },
      author: author
        ? {
            fullName: author.full_name,
            email: author.email,
            avatarUrl: author.avatar_url,
          }
        : { fullName: null, email: '', avatarUrl: null },
      repliesCount: t.comments_count ?? 0,
      reportsCount: reportCountMap.get(t.id) ?? 0,
    };
  });
}

// Threads are stored as TipTap-rendered HTML; the table needs plain text.
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
