import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getActiveRecipientsForCommunity } from '@/lib/broadcasts/recipients';
import { runBroadcast } from '@/lib/broadcasts/sender';
import { requireCommunityManager } from '@/lib/community-auth';

export const dynamic = 'force-dynamic';

interface Course {
  id: string;
  title: string;
  slug: string;
}

// Course titles and community names are owner-supplied text; escape them before
// they go into the email HTML.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(
  req: Request,
  props: { params: Promise<{ communitySlug: string; courseSlug: string }> }
) {
  const params = await props.params;
  try {
    // Emails every active member, so only the owner (or a platform admin) may
    // trigger it.
    const guard = await requireCommunityManager(params.communitySlug);
    if (!guard.ok) return guard.response;
    const { community } = guard;

    const course = await queryOne<Course>`
      SELECT id, title, slug FROM courses
      WHERE community_id = ${community.id} AND slug = ${params.courseSlug}
    `;
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const recipients = await getActiveRecipientsForCommunity(community.id);
    if (recipients.length === 0) {
      return NextResponse.json({
        success: true,
        totalEmails: 0,
        successfulEmails: 0,
        failedEmails: 0,
      });
    }

    const courseUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://dance-hub.io'}/${encodeURIComponent(community.slug)}/classroom/${encodeURIComponent(course.slug)}`;

    const htmlContent = `
      <h2 style="font-size:22px;margin:0 0 16px 0;color:#111827;">New course available</h2>
      <p style="margin:0 0 16px 0;line-height:1.6;color:#374151;">
        A new course is now live in <strong>${escapeHtml(community.name)}</strong>:
      </p>
      <p style="margin:0 0 24px 0;font-size:18px;color:#2563eb;">${escapeHtml(course.title)}</p>
      <p style="margin:0 0 24px 0;">
        <a href="${escapeHtml(courseUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:500;">View course</a>
      </p>
    `.trim();

    const result = await runBroadcast({
      broadcastId: `course-notify-${course.id}`,
      communityId: community.id,
      subject: `New course: ${course.title}`,
      htmlContent,
      recipients,
      fromName: community.name,
      replyTo: 'hello@dance-hub.io',
    });

    return NextResponse.json({
      success: true,
      totalEmails: recipients.length,
      successfulEmails: result.successfulCount,
      failedEmails: result.failedCount,
      status: result.status,
    });
  } catch (error) {
    console.error('Error in course notify route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
