"use client";

import { useState } from "react";
import Link from "next/link";
import { Instagram, Link2, Settings, Users } from "lucide-react";
import toast from "react-hot-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { InitialsAvatar } from "@/components/ds/initials-avatar";
import { MENU_ITEM, MENU_SEP, POP, POP_TITLE } from "@/components/community-shell/menu-styles";
import { communityPath } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";
import { TeacherBadge } from "./post-card";
import type { FeedCommunity, FeedPerson } from "./types";

export const BTN =
  "inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-[10px] px-3.5 text-[14px] font-semibold transition-[background-color,border-color,color,transform] active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-55 [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:shrink-0";
export const BTN_PRIMARY = `${BTN} bg-brand text-white shadow-card hover:bg-brand-hover`;
export const BTN_SECONDARY = `${BTN} border border-line-strong bg-surface text-ink hover:bg-surface-2`;
export const BTN_GHOST = `${BTN} text-ink-2 hover:bg-surface-2 hover:text-ink`;
export const BTN_LIVE = `${BTN} bg-live text-white hover:brightness-105`;

/** "@handle" for an Instagram profile link, or null. */
function instagramHandle(url: string): string | null {
  const m = url.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  return m ? `@${m[1]}` : null;
}

export async function copyInviteLink(slug: string) {
  const url = `${window.location.origin}${communityPath(slug, "/about")}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  } catch {
    toast.error("Couldn't copy the link. Copy it from the address bar on the About page.");
  }
}

function PersonRow({ person, you, teacher }: { person: FeedPerson; you: boolean; teacher: boolean }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14.5px] text-ink">
      <InitialsAvatar id={person.id} name={person.name} imageUrl={person.avatarUrl} size={28} />
      <span className="min-w-0 flex-1 truncate">
        {person.name}
        {you && <span className="text-ink-3"> (you)</span>}
      </span>
      {teacher && <TeacherBadge />}
    </div>
  );
}

export function FeedHeader({
  community,
  people,
  memberCount,
  rosterLoaded,
  viewerId,
  isOwner,
}: {
  community: FeedCommunity;
  /** Owner first, then the roster. */
  people: FeedPerson[];
  memberCount: number;
  rosterLoaded: boolean;
  viewerId: string;
  isOwner: boolean;
}) {
  const [allOpen, setAllOpen] = useState(false);
  const instagram = community.customLinks
    .map((l) => ({ url: l.url, handle: instagramHandle(l.url) }))
    .find((l) => l.handle);
  const face = people.slice(0, 5);
  const membersLabel = `${memberCount} ${memberCount === 1 ? "member" : "members"}`;

  return (
    <section id="community-header" aria-labelledby="community-name">
      {community.imageUrl && (
        <div className="aspect-[4/1] max-h-[200px] w-full overflow-hidden rounded-xl bg-black shadow-card sm:rounded-2xl">
          <img
            src={community.imageUrl}
            alt=""
            className="block h-full w-full object-cover"
            style={{
              objectPosition: `${community.imageFocalX}% ${community.imageFocalY}%`,
              transform: community.imageZoom !== 1 ? `scale(${community.imageZoom})` : undefined,
              transformOrigin: `${community.imageFocalX}% ${community.imageFocalY}%`,
            }}
          />
        </div>
      )}
      <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-0.5", community.imageUrl ? "pt-3.5 sm:pt-5" : "pt-2")}>
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-2">
          <h1 id="community-name" className="text-balance font-display text-[26px] font-semibold leading-[1.1] tracking-[-0.015em] text-ink sm:text-[32px]">
            {community.name}
          </h1>
          {community.description && <p className="max-w-[62ch] text-[15px] text-ink-2 sm:text-[16px]">{community.description}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px] text-ink-2">
            <Popover>
              <PopoverTrigger
                id="member-count"
                className="group/members inline-flex items-center gap-2.5 rounded-full py-0.5 pl-0.5 pr-2.5 transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand data-[state=open]:bg-surface-2"
              >
                {face.length > 0 && (
                  <span className="flex">
                    {face.map((p, i) => (
                      <InitialsAvatar
                        key={p.id}
                        id={p.id}
                        name={p.name}
                        imageUrl={p.avatarUrl}
                        size={28}
                        className={cn("ring-2 ring-canvas transition-[margin]", i > 0 && "-ml-2 group-hover/members:-ml-1")}
                      />
                    ))}
                  </span>
                )}
                <span>
                  <strong className="font-semibold text-ink">{memberCount}</strong> {memberCount === 1 ? "member" : "members"}
                </span>
              </PopoverTrigger>
              <PopoverContent align="start" sideOffset={8} className={cn(POP, "w-[280px]")}>
                <h2 className={POP_TITLE}>Members</h2>
                {!rosterLoaded && people.length <= 1 ? (
                  <p className="px-2.5 py-2 text-[14px] text-ink-3">Loading members</p>
                ) : (
                  people.slice(0, 8).map((p) => (
                    <PersonRow key={p.id} person={p} you={p.id === viewerId} teacher={p.id === community.createdBy} />
                  ))
                )}
                <div className={MENU_SEP} />
                <button type="button" className={MENU_ITEM} onClick={() => setAllOpen(true)}>
                  <Users aria-hidden="true" />
                  See all {membersLabel}
                </button>
              </PopoverContent>
            </Popover>
            {instagram && (
              <a
                href={instagram.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md text-ink-2 hover:text-brand-ink"
              >
                <Instagram className="h-4 w-4" aria-hidden="true" />
                {instagram.handle}
              </a>
            )}
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button type="button" className={cn(BTN_SECONDARY, "flex-1 sm:flex-none")} onClick={() => copyInviteLink(community.slug)}>
            <Link2 aria-hidden="true" />
            {isOwner ? "Invite" : "Invite a friend"}
          </button>
          {isOwner && (
            <Link id="manage-community-button" href={communityPath(community.slug, "/admin")} className={cn(BTN_PRIMARY, "flex-1 sm:flex-none")}>
              <Settings aria-hidden="true" />
              Manage community
            </Link>
          )}
        </div>
      </div>

      <Sheet open={allOpen} onOpenChange={setAllOpen}>
        <SheetContent side="right" className="w-full max-w-sm overflow-y-auto border-line bg-surface p-4 sm:max-w-sm">
          <SheetHeader className="px-2.5 pb-2 text-left">
            <SheetTitle className="font-display text-[19px] font-semibold text-ink">{membersLabel}</SheetTitle>
            <SheetDescription className="text-[14px] text-ink-3">Everyone in {community.name}.</SheetDescription>
          </SheetHeader>
          {people.map((p) => (
            <PersonRow key={p.id} person={p} you={p.id === viewerId} teacher={p.id === community.createdBy} />
          ))}
        </SheetContent>
      </Sheet>
    </section>
  );
}
