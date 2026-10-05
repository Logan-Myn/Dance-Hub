"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { FIELD_INPUT } from "@/components/ds/app-dialog";
import { CommunityCover } from "@/components/ds/community-cover";
import { EmptyState } from "@/components/ds/empty-state";
import { Pill } from "@/components/ds/pill";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/community-feed/feed-header";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useViewerTimeZone } from "@/hooks/use-viewer-time-zone";
import { searchCommunities, type DiscoveryCommunity } from "@/lib/discovery";
import { communityPath } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";

interface DiscoveryClientProps {
  communities: DiscoveryCommunity[];
  signedIn: boolean;
  savedTimeZone: string | null;
}

function CreateCommunityButton({ signedIn, primary, className }: { signedIn: boolean; primary?: boolean; className?: string }) {
  const { showAuthModal } = useAuthModal();
  const look = cn(primary ? BTN_PRIMARY : BTN_SECONDARY, className);
  const content = (
    <>
      <Plus aria-hidden="true" />
      Create a community
    </>
  );
  if (signedIn) {
    return (
      <Link href="/onboarding" className={look}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => showAuthModal("signup", "/onboarding")} className={look}>
      {content}
    </button>
  );
}

function CommunityResult({ community, timeZone }: { community: DiscoveryCommunity; timeZone: string }) {
  const inside = community.isMember || community.isOwner;
  const opening =
    community.status === "pre_registration"
      ? community.opening_date
        ? `Opens ${new Date(community.opening_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone })}`
        : "Opening soon"
      : null;
  const count = community.members_count;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-[box-shadow,border-color,transform] hover:-translate-y-px hover:border-line-strong hover:shadow-raised has-[a.card-link:focus-visible]:outline has-[a.card-link:focus-visible]:outline-2 has-[a.card-link:focus-visible]:outline-offset-2 has-[a.card-link:focus-visible]:outline-brand">
      <CommunityCover community={community} />
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h2 className="font-display text-[17px] font-semibold leading-snug text-ink [overflow-wrap:anywhere]">
          {/* Members open the community; everyone else lands on its About page, where joining happens. */}
          <Link
            href={communityPath(community.slug, inside ? "" : "/about")}
            className="card-link outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-brand-ink"
          >
            {community.name}
          </Link>
        </h2>
        {community.description && (
          <p className="line-clamp-2 text-[14px] leading-relaxed text-ink-2 [overflow-wrap:anywhere]">{community.description}</p>
        )}
        {(count > 0 || opening || inside) && (
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
            {count > 0 && (
              <span className="mr-auto text-[13.5px] text-ink-3">
                {count} {count === 1 ? "member" : "members"}
              </span>
            )}
            {opening && <Pill variant="warn">{opening}</Pill>}
            {community.isOwner ? <Pill variant="brand">Owner</Pill> : community.isMember && <Pill variant="ok">Joined</Pill>}
          </div>
        )}
      </div>
    </article>
  );
}

export default function DiscoveryClient({ communities, signedIn, savedTimeZone }: DiscoveryClientProps) {
  const [search, setSearch] = useState("");
  const timeZone = useViewerTimeZone(savedTimeZone);
  const searchId = useId();
  const shown = useMemo(() => searchCommunities(communities, search), [communities, search]);
  const searching = search.trim().length > 0;
  const total = communities.length;

  return (
    <main className="mx-auto flex max-w-[1120px] flex-col gap-6 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[34px]">
            Discover dance communities
          </h1>
          <p className="mt-1.5 max-w-[56ch] text-[15.5px] text-ink-2">
            Learn online with teachers and schools. Open a community to see what&apos;s inside and how to join.
          </p>
        </div>
        <CreateCommunityButton signedIn={signedIn} className="self-start sm:self-auto" />
      </header>

      {total > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-[420px]">
            <label htmlFor={searchId} className="sr-only">
              Search communities
            </label>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <input
              id={searchId}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, style or teacher"
              autoComplete="off"
              className={cn(FIELD_INPUT, "pl-10")}
            />
          </div>
          <p aria-live="polite" className="text-[13.5px] text-ink-3">
            {searching ? `${shown.length} of ${total}` : total} {total === 1 ? "community" : "communities"}
          </p>
        </div>
      )}

      {total === 0 ? (
        <EmptyState
          icon={<Search className="h-7 w-7" />}
          title="No communities yet"
          actions={<CreateCommunityButton signedIn={signedIn} primary />}
        >
          Be the first: create a community for your classes and invite your students.
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Search className="h-7 w-7" />}
          title={`Nothing matches "${search.trim()}"`}
          actions={
            <button type="button" onClick={() => setSearch("")} className={BTN_SECONDARY}>
              Clear search
            </button>
          }
        >
          Try another word, like a dance style or a teacher&apos;s name.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {shown.map((community) => (
            <CommunityResult key={community.id} community={community} timeZone={timeZone} />
          ))}
        </div>
      )}
    </main>
  );
}
