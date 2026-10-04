"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Compass, LayoutDashboard } from "lucide-react";
import NotificationsButton from "@/components/NotificationsButton";
import UserAccountNav from "@/components/UserAccountNav";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getCommunityTabs, isTabActive } from "@/lib/community-nav";
import type { Offerings } from "@/lib/offerings";
import { cn } from "@/lib/utils";

interface TopBarUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}

export interface TopBarProps {
  communitySlug: string;
  communityName: string;
  communityImageUrl: string | null;
  isMember: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  offerings: Offerings;
  /** Server-resolved user, so the first paint already shows the right side. */
  initialUser: TopBarUser | null;
  profile: { id: string; full_name: string | null; avatar_url: string | null } | null;
}

/** One bar for the community area on desktop: identity, tabs, account. */
export default function TopBar({
  communitySlug,
  communityName,
  communityImageUrl,
  isMember,
  isOwner,
  isAdmin,
  offerings,
  initialUser,
  profile,
}: TopBarProps) {
  const pathname = usePathname();
  const { user: contextUser, loading } = useAuth();
  const { showAuthModal } = useAuthModal();
  // Until the auth context hydrates, trust the server's answer.
  const user = (loading ? initialUser : contextUser) as TopBarUser | null;

  const tabs = getCommunityTabs({ slug: communitySlug, isMember, isOwner, isAdmin, offerings });
  const activeKey = tabs.find((t) => isTabActive(t, pathname, communitySlug))?.key;

  // Underline that follows hover and focus, and rests on the current tab.
  const navRef = useRef<HTMLElement>(null);
  const [ink, setInk] = useState<{ left: number; width: number } | null>(null);
  const moveInk = useCallback((el: HTMLElement | null) => {
    if (!el) return setInk(null);
    setInk({ left: el.offsetLeft + 12, width: Math.max(0, el.offsetWidth - 24) });
  }, []);
  const resetInk = useCallback(() => {
    moveInk(navRef.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? null);
  }, [moveInk]);
  useEffect(() => {
    resetInk();
    window.addEventListener("resize", resetInk);
    return () => window.removeEventListener("resize", resetInk);
  }, [resetInk, activeKey, tabs.length]);

  const initial = communityName.trim()[0]?.toUpperCase() ?? "?";

  return (
    <header className="sticky top-[env(safe-area-inset-top)] z-40 hidden border-b border-line bg-surface/90 backdrop-blur-md md:block">
      <div className="mx-auto flex h-[60px] max-w-[1160px] items-center gap-3 px-6">
        <Link
          href="/dashboard"
          aria-label="Dance-Hub home"
          title="Dance-Hub home"
          className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-brand font-display text-[13px] font-bold tracking-tight text-white"
        >
          DH
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-10 min-w-0 items-center gap-2.5 rounded-[10px] pl-1 pr-2 transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
            {communityImageUrl ? (
              <img src={communityImageUrl} alt="" className="h-[30px] w-[30px] shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-ink font-display text-[15px] font-semibold text-white">
                {initial}
              </span>
            )}
            <span className="truncate font-display text-[15px] font-semibold text-ink">{communityName}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuItem asChild>
              <Link href="/discovery" className="flex items-center gap-2">
                <Compass className="h-4 w-4" aria-hidden="true" />
                Find more communities
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard" className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                My dashboard
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <nav
          ref={navRef}
          id="navigation-tab-buttons"
          aria-label="Community sections"
          className="relative ml-3 flex h-full items-stretch"
          onMouseLeave={resetInk}
          onBlur={resetInk}
        >
          {tabs.map((t) => {
            const active = t.key === activeKey;
            return (
              <Link
                key={t.key}
                id={t.id}
                href={t.href}
                aria-current={active ? "page" : undefined}
                onMouseEnter={(e) => moveInk(e.currentTarget)}
                onFocus={(e) => moveInk(e.currentTarget)}
                className={cn(
                  "flex items-center whitespace-nowrap px-3 text-[14.5px] transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
                  active ? "font-semibold text-ink" : "font-medium text-ink-2 hover:text-ink"
                )}
              >
                {t.label}
              </Link>
            );
          })}
          {ink && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-[-1px] left-0 h-0.5 rounded bg-brand transition-[transform,width] duration-300 ease-out motion-reduce:transition-none"
              style={{ width: ink.width, transform: `translateX(${ink.left}px)` }}
            />
          )}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          {user ? (
            <>
              <NotificationsButton />
              <UserAccountNav user={user} profile={profile} />
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => showAuthModal("signin")}
                className="h-9 rounded-[10px] px-3.5 text-sm font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => showAuthModal("signup")}
                className="h-9 rounded-[10px] bg-brand px-3.5 text-sm font-semibold text-white shadow-card hover:bg-brand-hover"
              >
                Sign up
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
