"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface CommunityNavbarProps {
  communitySlug: string;
  isMember: boolean;
  isOwner?: boolean;
  // Legacy: pages that still render their own chrome pass this. Active tab is
  // now derived from usePathname; remove once all pages are migrated.
  activePage?: string;
}

export default function CommunityNavbar({ communitySlug, isMember, isOwner = false }: CommunityNavbarProps) {
  const pathname = usePathname();

  const navItems: Array<{ label: string; href: string; memberOnly?: boolean; ownerOnly?: boolean }> = [
    { label: "Community", href: `/${communitySlug}` },
    { label: "Classroom", href: `/${communitySlug}/classroom`, memberOnly: true },
    { label: "Private Lessons", href: `/${communitySlug}/private-lessons`, memberOnly: false },
    { label: "Calendar", href: `/${communitySlug}/calendar`, memberOnly: true },
    { label: "About", href: `/${communitySlug}/about` },
    { label: "Admin", href: `/${communitySlug}/admin`, ownerOnly: true },
  ];

  const broadcastsEnabled = process.env.NEXT_PUBLIC_BROADCASTS_ENABLED === "true";

  const visibleItems = navItems.filter(item => {
    if (item.memberOnly && !isMember) return false;
    if (item.ownerOnly && !isOwner) return false;
    if (item.label === "Admin" && !broadcastsEnabled) return false;
    return true;
  });

  // Community is the root path; every other tab is a sub-path. Use exact match
  // for the root and startsWith for the rest so /classroom/foo still highlights
  // Classroom.
  const rootHref = `/${communitySlug}`;
  const isActive = (href: string) =>
    href === rootHref ? pathname === rootHref : pathname?.startsWith(href);

  return (
    <nav className="bg-card border-b border-border/50 sticky top-0 z-30 backdrop-blur-sm bg-card/95" id="navigation-tabs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14">
          <div className="flex gap-1" id="navigation-tab-buttons">
            {visibleItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "inline-flex items-center px-4 py-2 my-2 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive(item.href)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                id={`tab-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
