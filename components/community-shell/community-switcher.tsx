"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Check, ChevronDown, LayoutDashboard, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetcher } from "@/lib/fetcher";
import { communityPath } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";
import { MENU_ITEM, MENU_SEP, POP, POP_TITLE } from "./menu-styles";

interface MyCommunity {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  created_by: string;
  member_joined_at?: string | null;
}

function CommunityTile({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  if (imageUrl) {
    return <img src={imageUrl} alt="" className="h-[30px] w-[30px] shrink-0 rounded-lg object-cover" />;
  }
  return (
    <span
      aria-hidden="true"
      className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-black font-display text-[15px] font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.14)]"
    >
      {name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

function memberSince(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `Member since ${d.toLocaleDateString("en-US", sameYear ? { month: "long" } : { month: "long", year: "numeric" })}`;
}

/** Current community, with the viewer's other communities one click away. */
export default function CommunitySwitcher({
  communitySlug,
  communityName,
  communityImageUrl,
  userId,
}: {
  communitySlug: string;
  communityName: string;
  communityImageUrl: string | null;
  userId: string | null;
}) {
  const [open, setOpen] = useState(false);
  // Same key as the dashboard; only fetched once the menu has been opened.
  const [wanted, setWanted] = useState(false);
  const { data: mine, isLoading } = useSWR<MyCommunity[]>(
    userId && wanted ? `user-communities:${userId}` : null,
    fetcher
  );

  const list = (Array.isArray(mine) ? mine : [])
    .slice()
    .sort((a, b) => Number(b.slug === communitySlug) - Number(a.slug === communitySlug));

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setWanted(true);
      }}
    >
      <DropdownMenuTrigger
        onPointerEnter={() => setWanted(true)}
        className="flex h-10 min-w-0 shrink-0 items-center gap-2.5 rounded-[10px] pl-1 pr-2 transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand data-[state=open]:bg-surface-2"
      >
        <CommunityTile name={communityName} imageUrl={communityImageUrl} />
        <span className="hidden max-w-[220px] truncate font-display text-[15px] font-semibold text-ink lg:block">
          {communityName}
        </span>
        <span className="sr-only lg:hidden">{communityName}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className={cn(POP, "w-[280px]")}>
        {userId && (isLoading || list.length > 0) && (
          <>
            <DropdownMenuLabel className={POP_TITLE}>Your communities</DropdownMenuLabel>
            {isLoading && list.length === 0 ? (
              <div className="flex items-center gap-2.5 px-2.5 py-2" aria-hidden="true">
                <span className="h-[30px] w-[30px] animate-pulse rounded-lg bg-surface-3 motion-reduce:animate-none" />
                <span className="h-3 w-32 animate-pulse rounded bg-surface-3 motion-reduce:animate-none" />
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto">
                {list.map((c) => {
                  const current = c.slug === communitySlug;
                  const sub = c.created_by === userId ? "Owner" : memberSince(c.member_joined_at);
                  return (
                    <DropdownMenuItem key={c.id} asChild className={MENU_ITEM}>
                      <Link href={communityPath(c.slug)} aria-current={current ? "page" : undefined}>
                        <CommunityTile name={c.name} imageUrl={c.image_url} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{c.name}</span>
                          {sub && <span className="block text-[12.5px] text-ink-3">{sub}</span>}
                        </span>
                        {current && <Check className="!h-4 !w-4 !text-brand-ink" aria-hidden="true" />}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </div>
            )}
            <DropdownMenuSeparator className={MENU_SEP} />
          </>
        )}
        <DropdownMenuItem asChild className={MENU_ITEM}>
          <Link href="/discovery">
            <Search aria-hidden="true" />
            Find more communities
          </Link>
        </DropdownMenuItem>
        {userId && (
          <DropdownMenuItem asChild className={MENU_ITEM}>
            <Link href="/dashboard">
              <LayoutDashboard aria-hidden="true" />
              My dashboard
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
