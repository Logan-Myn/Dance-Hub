import { cache } from "react";
import { queryOne } from "@/lib/db";
import { getOfferings } from "@/lib/offerings";
import type { CommunityRow } from "@/lib/community-data";
import { communityPath } from "@/lib/safe-redirect";

export type AttentionSeverity = "critical" | "warn" | "info";

export interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  title: string;
  text: string;
  action: { label: string; href: string };
}

interface Counts {
  failed: number;
  lesson_types: number;
  open_slots: number;
  unanswered: number;
  classes_today: number;
  next_class_at: string | null;
}

/** Things the owner should act on, from the database only (no payment-provider calls). */
export const getAttention = cache(async (community: CommunityRow, now: Date): Promise<AttentionItem[]> => {
  const offered = getOfferings(community);
  const today = now.toISOString().slice(0, 10);
  const c = await queryOne<Counts>`
    SELECT
      (SELECT COUNT(*)::int FROM community_members
         WHERE community_id = ${community.id} AND status = 'active'
           AND subscription_status IN ('past_due', 'unpaid')) AS failed,
      (SELECT COUNT(*)::int FROM private_lessons
         WHERE community_id = ${community.id} AND is_active = true) AS lesson_types,
      (SELECT COUNT(*)::int FROM teacher_availability_slots
         WHERE community_id = ${community.id} AND is_active = true
           AND availability_date >= ${today}::date) AS open_slots,
      (SELECT COUNT(*)::int FROM threads
         WHERE community_id = ${community.id} AND COALESCE(comments_count, 0) = 0
           AND user_id <> ${community.created_by}
           AND created_at > NOW() - INTERVAL '14 days') AS unanswered,
      (SELECT COUNT(*)::int FROM live_classes
         WHERE community_id = ${community.id} AND status <> 'cancelled'
           AND scheduled_start_time >= ${now.toISOString()}::timestamptz
           AND scheduled_start_time < ${now.toISOString()}::timestamptz + INTERVAL '24 hours') AS classes_today,
      (SELECT MIN(scheduled_start_time)::text FROM live_classes
         WHERE community_id = ${community.id} AND status <> 'cancelled'
           AND scheduled_start_time >= ${now.toISOString()}::timestamptz) AS next_class_at
  `;
  const slug = community.slug;
  const items: AttentionItem[] = [];
  const paid = !!community.membership_enabled && Number(community.membership_price ?? 0) > 0;

  if (!community.stripe_account_id && (paid || offered.privateLessons)) {
    items.push({
      id: "payouts",
      severity: "critical",
      title: "Payouts aren't set up",
      text: "Members can't pay you for a membership or a lesson until you connect a bank account.",
      action: { label: "Set up payouts", href: communityPath(slug, "/admin/subscriptions") },
    });
  }
  if (c && c.failed > 0) {
    items.push({
      id: "failed",
      severity: "critical",
      title: c.failed === 1 ? "A payment failed" : `${c.failed} payments failed`,
      text: "Their card was declined. It's retried automatically; you can reach out to them in the meantime.",
      action: { label: c.failed === 1 ? "See the member" : "See the members", href: `${communityPath(slug, "/admin/members")}?filter=failed` },
    });
  }
  if (offered.privateLessons && c && c.lesson_types > 0 && c.open_slots === 0) {
    items.push({
      id: "no-times",
      severity: "warn",
      title: "Nobody can book a private lesson",
      text: "You have lesson types but no open times coming up.",
      action: { label: "Add open times", href: communityPath(slug, "/private-lessons") },
    });
  }
  if (!community.about_page) {
    items.push({
      id: "about",
      severity: "info",
      title: "Your About page is a starter page",
      text: "Visitors see a page built from what you offer. A welcome video and a few words about you help them join.",
      action: { label: "Edit the About page", href: `${communityPath(slug, "/about")}?edit=1` },
    });
  }
  if (c && c.unanswered > 0) {
    items.push({
      id: "unanswered",
      severity: "info",
      title: c.unanswered === 1 ? "A post has no reply yet" : `${c.unanswered} posts have no reply yet`,
      text: "From the last two weeks. A quick answer keeps the feed alive.",
      action: { label: "Open the feed", href: communityPath(slug) },
    });
  }
  if (offered.liveClasses && c && c.classes_today > 0 && c.next_class_at) {
    items.push({
      id: "class-soon",
      severity: "info",
      title: c.classes_today === 1 ? "A live class in the next 24 hours" : `${c.classes_today} live classes in the next 24 hours`,
      text: "Members can join from the calendar once the room opens.",
      action: { label: "Open the calendar", href: communityPath(slug, "/calendar") },
    });
  }
  return items;
});

/** What the sidebar counts: things that need doing, not news. */
export function attentionCount(items: AttentionItem[]): number {
  return items.filter((i) => i.severity !== "info").length;
}
