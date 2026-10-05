"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, Link2, Mail, Search, Trash2, Users } from "lucide-react";
import toast from "react-hot-toast";
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, copyInviteLink } from "@/components/community-feed/feed-header";
import { Card, Screen, ScreenHead } from "@/components/community-admin/ui";
import { Chip } from "@/components/ds/chip";
import { Drawer } from "@/components/ds/drawer";
import { EmptyState } from "@/components/ds/empty-state";
import { InitialsAvatar } from "@/components/ds/initials-avatar";
import { InlineConfirm } from "@/components/ds/inline-confirm";
import { Pill, type PillVariant } from "@/components/ds/pill";
import { useNow } from "@/hooks/use-now";
import { useViewerTimeZone } from "@/hooks/use-viewer-time-zone";
import { timeAgo } from "@/lib/feed/time-ago";
import { cn } from "@/lib/utils";

export interface AdminMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  joinedAt: string | null;
  status: string;
  subscriptionStatus: string | null;
  hasSubscription: boolean;
  periodEnd: string | null;
  cancelledAt: string | null;
  lastActive: string | null;
  posts: number;
  replies: number;
  privateLessons: number;
  lessonsDone: number;
}

type MemberState = "active" | "canceling" | "failed" | "pre" | "left";
type Filter = "all" | "paying" | "free" | "canceling" | "failed";

export function memberState(m: Pick<AdminMember, "status" | "subscriptionStatus">): MemberState {
  if (m.status === "inactive") return "left";
  if (m.status === "pre_registered" || m.status === "pending_pre_registration") return "pre";
  if (m.subscriptionStatus === "canceling") return "canceling";
  if (m.subscriptionStatus === "past_due" || m.subscriptionStatus === "unpaid") return "failed";
  return "active";
}

const paying = (m: AdminMember) => {
  const s = memberState(m);
  return m.hasSubscription && (s === "active" || s === "canceling" || s === "failed");
};

const STATE_PILL: Record<MemberState, [PillVariant, string]> = {
  active: ["ok", "Active"],
  canceling: ["warn", "Canceling"],
  failed: ["live", "Payment failed"],
  pre: ["brand", "Pre-registered"],
  left: ["muted", "Left"],
};

const FILTERS: Array<[Filter, string]> = [
  ["all", "Everyone"],
  ["paying", "Paying"],
  ["free", "Free"],
  ["canceling", "Canceling"],
  ["failed", "Payment failed"],
];

function matches(m: AdminMember, f: Filter): boolean {
  const s = memberState(m);
  switch (f) {
    case "all":
      return true;
    case "paying":
      return paying(m);
    case "free":
      return s === "active" && !m.hasSubscription;
    default:
      return s === f;
  }
}

const day = (iso: string | null, timeZone: string) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone }) : "Unknown";

type SortKey = "name" | "joined" | "last";

export function MembersClient({
  slug,
  members,
  showCourses,
  initialFilter,
  serverNow,
}: {
  slug: string;
  members: AdminMember[];
  showCourses: boolean;
  initialFilter: string;
  serverNow: number;
}) {
  const router = useRouter();
  const now = useNow(60_000, serverNow) ?? new Date(serverNow);
  const timeZone = useViewerTimeZone(null);
  const [filter, setFilter] = useState<Filter>(FILTERS.some(([f]) => f === initialFilter) ? (initialFilter as Filter) : "all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "joined", dir: -1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const counts = Object.fromEntries(FILTERS.map(([f]) => [f, members.filter((m) => matches(m, f)).length])) as Record<Filter, number>;
  const withAccess = members.filter((m) => ["active", "canceling", "failed"].includes(memberState(m))).length;

  const needle = q.trim().toLowerCase();
  const list = members
    .filter((m) => matches(m, filter) && (!needle || `${m.name} ${m.email}`.toLowerCase().includes(needle)))
    .sort((a, b) => {
      const v =
        sort.key === "name"
          ? a.name.localeCompare(b.name)
          : sort.key === "joined"
            ? (a.joinedAt ?? "").localeCompare(b.joinedAt ?? "")
            : (a.lastActive ?? "").localeCompare(b.lastActive ?? "");
      return v * sort.dir;
    });
  const allShownSelected = list.length > 0 && list.every((m) => selected.has(m.id));
  const open = members.find((m) => m.id === openId) ?? null;

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const copyEmails = async () => {
    const emails = members.filter((m) => selected.has(m.id) && m.email).map((m) => m.email);
    try {
      await navigator.clipboard.writeText(emails.join(", "));
      toast.success(`${emails.length} ${emails.length === 1 ? "email" : "emails"} copied`);
    } catch {
      toast.error("Couldn't copy. Your browser blocked it.");
    }
  };

  const remove = async (m: AdminMember) => {
    setRemoving(true);
    try {
      const res = await fetch(`/api/community/${slug}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: m.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Couldn't remove the member. Try again.");
      }
      toast.success(`${m.name} was removed`);
      setOpenId(null);
      setConfirmRemove(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove the member. Try again.");
    } finally {
      setRemoving(false);
    }
  };

  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : undefined);
  const sortButton = (key: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "name" ? 1 : -1 }))}
      className="inline-flex items-center gap-1 font-semibold text-ink-2 hover:text-ink"
    >
      {label}
      {sort.key === key && (sort.dir === 1 ? <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />)}
    </button>
  );

  if (members.length === 0) {
    return (
      <Screen>
        <ScreenHead title="Members" sub="Nobody has joined yet" />
        <EmptyState
          icon={<Users className="h-7 w-7" />}
          title="Invite your first members"
          actions={
            <button type="button" className={BTN_PRIMARY} onClick={() => copyInviteLink(slug)}>
              <Link2 aria-hidden="true" />
              Copy invite link
            </button>
          }
        >
          Share your community link with your students. When they join, you see their status and activity here.
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHead
        title="Members"
        sub={[
          `${withAccess} ${withAccess === 1 ? "member" : "members"}`,
          counts.canceling ? `${counts.canceling} canceling` : null,
          counts.failed ? `${counts.failed} with a failed payment` : null,
        ]
          .filter(Boolean)
          .join(", ")}
        actions={
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => copyInviteLink(slug)}>
              <Link2 aria-hidden="true" />
              Copy invite link
            </button>
          </>
        }
      />

      <div className="flex flex-col gap-3">
        <label className="relative block max-w-[420px]">
          <span className="sr-only">Search members</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email"
            autoComplete="off"
            className="h-10 w-full rounded-[10px] border border-line bg-surface pl-9 pr-3 text-[14.5px] text-ink outline-none placeholder:text-ink-3 focus:border-brand"
          />
        </label>
        <div role="group" aria-label="Filter members" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          {FILTERS.filter(([f]) => f === "all" || counts[f] > 0).map(([f, label]) => (
            <Chip key={f} label={label} count={counts[f]} pressed={filter === f} onClick={() => setFilter(f)} />
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full table-fixed text-left text-[14px]">
          <thead className="border-b border-line bg-surface-2 text-[13px]">
            <tr>
              <th scope="col" className="w-11 py-2.5 pl-4 pr-1">
                <input
                  type="checkbox"
                  aria-label="Select everyone shown"
                  checked={allShownSelected}
                  onChange={() =>
                    setSelected((s) => {
                      const next = new Set(s);
                      list.forEach((m) => (allShownSelected ? next.delete(m.id) : next.add(m.id)));
                      return next;
                    })
                  }
                  className="h-4 w-4 accent-[rgb(var(--ds-brand))]"
                />
              </th>
              <th scope="col" aria-sort={ariaSort("name")} className="px-3 py-2.5">
                {sortButton("name", "Member")}
              </th>
              <th scope="col" className="hidden w-[170px] px-3 py-2.5 font-semibold text-ink-2 sm:table-cell">
                Status
              </th>
              <th scope="col" aria-sort={ariaSort("joined")} className="hidden w-[130px] px-3 py-2.5 md:table-cell">
                {sortButton("joined", "Joined")}
              </th>
              <th scope="col" aria-sort={ariaSort("last")} className="hidden w-[130px] px-3 py-2.5 lg:table-cell">
                {sortButton("last", "Last active")}
              </th>
              <th scope="col" className="hidden w-[120px] px-3 py-2.5 pr-4 font-semibold text-ink-2 lg:table-cell">
                {showCourses ? "Lessons done" : "Posts"}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-2">
                  No members match.{" "}
                  <button
                    type="button"
                    className="font-semibold text-brand-ink hover:underline"
                    onClick={() => {
                      setQ("");
                      setFilter("all");
                    }}
                  >
                    Clear search and filters
                  </button>
                </td>
              </tr>
            ) : (
              list.map((m) => {
                const s = memberState(m);
                const [variant, label] = STATE_PILL[s];
                return (
                  <tr key={m.id} className={cn("transition-colors hover:bg-surface-2", selected.has(m.id) && "bg-brand-soft/60")}>
                    <td className="py-2.5 pl-4 pr-1">
                      <input
                        type="checkbox"
                        aria-label={`Select ${m.name}`}
                        checked={selected.has(m.id)}
                        onChange={() => toggle(m.id)}
                        className="h-4 w-4 accent-[rgb(var(--ds-brand))]"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <button type="button" onClick={() => setOpenId(m.id)} className="flex w-full min-w-0 items-center gap-2.5 text-left">
                        <InitialsAvatar id={m.userId} name={m.name} imageUrl={m.avatarUrl} size={32} />
                        <span className="min-w-0">
                          <strong className="block truncate font-semibold text-ink hover:text-brand-ink">{m.name}</strong>
                          <span className="block truncate text-[13px] text-ink-3">{m.email}</span>
                          <span className="mt-1 sm:hidden">
                            <Pill variant={variant}>{label}</Pill>
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2.5 sm:table-cell">
                      <Pill variant={variant}>
                        {label}
                        {s === "canceling" && m.periodEnd ? `, until ${new Date(m.periodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone })}` : ""}
                      </Pill>
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2.5 tabular-nums text-ink-2 md:table-cell">{day(m.joinedAt, timeZone)}</td>
                    <td className="hidden whitespace-nowrap px-3 py-2.5 text-ink-2 lg:table-cell">{m.lastActive ? timeAgo(m.lastActive, now, timeZone) : "Not recorded"}</td>
                    <td className="hidden px-3 py-2.5 pr-4 tabular-nums text-ink-2 lg:table-cell">{showCourses ? m.lessonsDone : m.posts}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>

      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Selected members"
          className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-20 flex flex-wrap items-center gap-2.5 rounded-[14px] bg-ink py-2.5 pl-4 pr-3 text-surface shadow-overlay motion-safe:animate-pop-in md:bottom-4"
        >
          <strong className="mr-auto text-[14px]">{selected.size} selected</strong>
          <button type="button" onClick={copyEmails} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand px-3.5 text-[14px] font-semibold text-white hover:bg-brand-hover">
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copy emails
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="inline-flex h-9 items-center rounded-[10px] border border-surface/35 px-3.5 text-[14px] font-semibold text-surface hover:bg-surface/10">
            Clear
          </button>
        </div>
      )}

      <Drawer
        open={!!open}
        onOpenChange={(o) => {
          if (!o) {
            setOpenId(null);
            setConfirmRemove(false);
          }
        }}
        title="Member"
      >
        {open && (
          <>
            <div className="flex items-center gap-3.5">
              <InitialsAvatar id={open.userId} name={open.name} imageUrl={open.avatarUrl} size={56} />
              <div className="min-w-0">
                <h2 className="truncate font-display text-[20px] font-semibold text-ink">{open.name}</h2>
                <p className="truncate text-[14px] text-ink-2">{open.email}</p>
                <div className="mt-1.5">
                  <Pill variant={STATE_PILL[memberState(open)][0]}>{STATE_PILL[memberState(open)][1]}</Pill>
                </div>
              </div>
            </div>
            {memberState(open) === "failed" && (
              <p className="rounded-xl bg-live-soft px-4 py-3 text-[14px] text-ink">
                <strong className="block text-live">Their last payment failed</strong>
                It&apos;s retried automatically. If it keeps failing, their access ends.
              </p>
            )}
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2.5 text-[14px]">
              <dt className="text-ink-2">Member since</dt>
              <dd className="text-right tabular-nums text-ink">{day(open.joinedAt, timeZone)}</dd>
              {memberState(open) === "canceling" && (
                <>
                  <dt className="text-ink-2">Access until</dt>
                  <dd className="text-right tabular-nums text-ink">{day(open.periodEnd, timeZone)}</dd>
                </>
              )}
              {memberState(open) === "active" && open.hasSubscription && open.periodEnd && (
                <>
                  <dt className="text-ink-2">Next charge</dt>
                  <dd className="text-right tabular-nums text-ink">{day(open.periodEnd, timeZone)}</dd>
                </>
              )}
              {memberState(open) === "left" && (
                <>
                  <dt className="text-ink-2">Left</dt>
                  <dd className="text-right tabular-nums text-ink">{day(open.cancelledAt, timeZone)}</dd>
                </>
              )}
              <dt className="text-ink-2">Plan</dt>
              <dd className="text-right text-ink">{open.hasSubscription ? "Paid membership" : "Free"}</dd>
              <dt className="text-ink-2">Last active</dt>
              <dd className="text-right text-ink">{open.lastActive ? timeAgo(open.lastActive, now, timeZone) : "Not recorded"}</dd>
            </dl>
            <section aria-labelledby="m-activity" className="flex flex-col gap-2.5 border-t border-line pt-4">
              <h3 id="m-activity" className="text-[13px] font-semibold text-ink-2">
                Activity
              </h3>
              <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2.5 text-[14px]">
                <dt className="text-ink-2">Posts and replies</dt>
                <dd className="text-right tabular-nums text-ink">
                  {open.posts} {open.posts === 1 ? "post" : "posts"}, {open.replies} {open.replies === 1 ? "reply" : "replies"}
                </dd>
                {showCourses && (
                  <>
                    <dt className="text-ink-2">Course lessons done</dt>
                    <dd className="text-right tabular-nums text-ink">{open.lessonsDone}</dd>
                  </>
                )}
                <dt className="text-ink-2">Private lessons</dt>
                <dd className="text-right tabular-nums text-ink">{open.privateLessons || "None"}</dd>
              </dl>
            </section>
            <section aria-labelledby="m-actions" className="flex flex-col gap-2.5 border-t border-line pt-4">
              <h3 id="m-actions" className="text-[13px] font-semibold text-ink-2">
                Actions
              </h3>
              <div className="flex flex-wrap gap-2">
                {open.email && (
                  <a href={`mailto:${open.email}`} className={cn(BTN_SECONDARY, "h-9")}>
                    <Mail aria-hidden="true" />
                    Email
                  </a>
                )}
                {memberState(open) !== "left" && !confirmRemove && (
                  <button type="button" className={cn(BTN_GHOST, "h-9")} onClick={() => setConfirmRemove(true)}>
                    <Trash2 aria-hidden="true" />
                    Remove from community
                  </button>
                )}
              </div>
              {confirmRemove && (
                <InlineConfirm
                  title={`Remove ${open.name}?`}
                  confirmLabel={removing ? "Removing…" : "Remove"}
                  cancelLabel="Keep member"
                  busy={removing}
                  onCancel={() => setConfirmRemove(false)}
                  onConfirm={() => void remove(open)}
                >
                  {open.hasSubscription
                    ? "Their subscription is canceled right away and they lose access. They can join again later."
                    : "They lose access right away. They can join again later."}
                </InlineConfirm>
              )}
            </section>
          </>
        )}
      </Drawer>
    </Screen>
  );
}
