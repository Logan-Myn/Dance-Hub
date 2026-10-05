import { requireCommunityManagerPage } from '@/lib/community-auth';
import { query } from '@/lib/db';
import { getCommunityBySlug } from '@/lib/community-data';
import { getOfferings } from '@/lib/offerings';
import { REPLAYS_COURSE_SLUG } from '@/lib/classroom/replays';
import { MembersClient, type AdminMember } from '@/components/community-admin/members-client';

// Opt out of the data cache so the page re-renders with fresh data after each
// change + router.refresh().
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// The moment this request renders.
function requestTime(): number {
  return Date.now();
}

export default async function MembersPage(
  props: {
    params: Promise<{ communitySlug: string }>;
    searchParams: Promise<{ filter?: string }>;
  }
) {
  const params = await props.params;
  await requireCommunityManagerPage(params.communitySlug);
  const searchParams = await props.searchParams;
  const community = await getCommunityBySlug(params.communitySlug);
  if (!community) return null;

  // Everyone who joined (or is joining through pre-registration), including
  // members who cancel or left, so the owner can see who needs attention.
  // Unfinished checkouts (status 'pending') aren't members and stay out.
  const members = await query<AdminMember>`
    SELECT
      cm.id,
      cm.user_id AS "userId",
      COALESCE(NULLIF(p.display_name, ''), NULLIF(p.full_name, ''), 'Member') AS name,
      COALESCE(p.email, '') AS email,
      p.avatar_url AS "avatarUrl",
      cm.joined_at::text AS "joinedAt",
      cm.status,
      cm.subscription_status AS "subscriptionStatus",
      (cm.stripe_subscription_id IS NOT NULL) AS "hasSubscription",
      cm.current_period_end::text AS "periodEnd",
      cm.cancelled_at::text AS "cancelledAt",
      cm.feed_visit_at::text AS "lastActive",
      (SELECT COUNT(*)::int FROM threads t WHERE t.community_id = cm.community_id AND t.user_id = cm.user_id) AS posts,
      (SELECT COUNT(*)::int FROM comments c JOIN threads t ON t.id = c.thread_id
         WHERE t.community_id = cm.community_id AND c.user_id = cm.user_id) AS replies,
      -- live_class_participants.student_id is the profile id (uuid), not the auth id.
      (SELECT COUNT(DISTINCT lp.live_class_id)::int FROM live_class_participants lp JOIN live_classes lc ON lc.id = lp.live_class_id
         WHERE lc.community_id = cm.community_id AND lp.student_id = p.id) AS "liveClasses",
      (SELECT COUNT(*)::int FROM lesson_bookings lb
         WHERE lb.community_id = cm.community_id AND lb.student_id = cm.user_id AND lb.payment_status = 'succeeded') AS "privateLessons",
      (SELECT COUNT(*)::int FROM lesson_completions lc2
         JOIN lessons l ON l.id = lc2.lesson_id JOIN chapters ch ON ch.id = l.chapter_id JOIN courses co ON co.id = ch.course_id
         WHERE co.community_id = cm.community_id AND co.slug <> ${REPLAYS_COURSE_SLUG} AND lc2.user_id = cm.user_id) AS "lessonsDone"
    FROM community_members cm
    LEFT JOIN profiles p ON p.auth_user_id = cm.user_id
    WHERE cm.community_id = ${community.id}
      AND cm.user_id <> ${community.created_by}
      AND COALESCE(cm.role, 'member') <> 'admin'
      AND cm.status IN ('active', 'inactive', 'pre_registered', 'pending_pre_registration')
    ORDER BY cm.joined_at DESC NULLS LAST
  `;

  return (
    <MembersClient
      slug={params.communitySlug}
      members={members}
      showCourses={getOfferings(community).courses}
      initialFilter={searchParams.filter ?? 'all'}
      serverNow={requestTime()}
    />
  );
}
