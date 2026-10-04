import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getSession } from '@/lib/auth-session';
import { canViewCommunity } from '@/lib/community-auth';
import { sanitizeRichText } from '@/lib/sanitize-html';

interface Community {
  created_by: string;
  thread_categories: any[] | null;
}

interface Profile {
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface Thread {
  id: string;
  title: string;
  content: string;
  community_id: string;
  user_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  author_name: string;
  author_image: string | null;
  category_id: string | null;
  category_name: string | null;
  pinned: boolean;
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { title, content: rawContent, communityId, categoryId, pinned } = await request.json();
    // The body is editor HTML, but the API takes any string: store only the
    // allowlisted markup. Non-strings and markup-only payloads end up empty.
    const content = sanitizeRichText(rawContent);

    if (!title || !content || !communityId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const community = await queryOne<Community>`
      SELECT created_by, thread_categories
      FROM communities
      WHERE id = ${communityId}
    `;

    if (!community) {
      return NextResponse.json(
        { error: 'Community not found' },
        { status: 404 }
      );
    }

    if (!(await canViewCommunity(userId, { id: communityId, created_by: community.created_by }, { allowPreRegistered: true }))) {
      return NextResponse.json(
        { error: 'Only community members can post here' },
        { status: 403 }
      );
    }

    // A community without topics takes posts without one; otherwise a topic
    // is required.
    const categories: any[] = Array.isArray(community.thread_categories) ? community.thread_categories : [];
    const category = categoryId ? categories.find((cat: any) => cat.id === categoryId) : null;
    if (categories.length > 0 && !category) {
      return NextResponse.json(
        { error: categoryId ? 'Category not found' : 'Missing required fields' },
        { status: categoryId ? 404 : 400 }
      );
    }

    if (category?.creatorOnly && userId !== community.created_by) {
      return NextResponse.json(
        { error: 'Only the community creator can post in this category' },
        { status: 403 }
      );
    }

    const profile = await queryOne<Profile>`
      SELECT full_name, display_name, avatar_url
      FROM profiles
      WHERE auth_user_id = ${userId}
    `;

    const authorName = profile?.display_name || profile?.full_name || 'Anonymous';
    const authorImage = profile?.avatar_url || null;
    // Take the category name from the stored category, not the request body.
    const categoryName: string | null = typeof category?.name === 'string' ? category.name : null;

    const thread = await queryOne<Thread>`
      INSERT INTO threads (
        title,
        content,
        community_id,
        user_id,
        created_by,
        created_at,
        updated_at,
        author_name,
        author_image,
        category_id,
        category_name,
        pinned
      ) VALUES (
        ${title},
        ${content},
        ${communityId},
        ${userId},
        ${userId},
        NOW(),
        NOW(),
        ${authorName},
        ${authorImage},
        ${category ? categoryId : null},
        ${categoryName},
        ${pinned && userId === community.created_by ? pinned : false}
      )
      RETURNING *
    `;

    if (!thread) {
      return NextResponse.json(
        { error: 'Failed to create thread' },
        { status: 500 }
      );
    }

    // Format the response to match the expected structure
    const formattedThread = {
      ...thread,
      createdAt: thread.created_at,
      userId: thread.user_id,
      author: {
        name: thread.author_name,
        image: thread.author_image,
      },
      likesCount: 0,
      commentsCount: 0,
      likes: [],
      comments: [],
    };

    return NextResponse.json(formattedThread);
  } catch (error) {
    console.error('Error creating thread:', error);
    return NextResponse.json(
      { error: 'Failed to create thread' },
      { status: 500 }
    );
  }
}
