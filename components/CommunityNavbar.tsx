import Link from "next/link";
import { cn } from "@/lib/utils";

interface CommunityNavbarProps {
  communitySlug: string;
  activePage: string;
  isMember: boolean;
  isOwner?: boolean;
}

export default function CommunityNavbar({ communitySlug, activePage, isMember, isOwner = false }: CommunityNavbarProps) {
  const navItems: Array<{ label: string; href: string; memberOnly?: boolean; ownerOnly?: boolean }> = [
    { label: "Community", href: `/${communitySlug}` },
    { label: "Classroom", href: `/${communitySlug}/classroom`, memberOnly: true },
    { label: "Private Lessons", href: `/${communitySlug}/private-lessons`, memberOnly: false },
    { label: "Calendar", href: `/${communitySlug}/calendar`, memberOnly: true },
    { label: "About", href: `/${communitySlug}/about` },
    { label: "Admin", href: `/${communitySlug}/admin`, ownerOnly: true },
  ];

  const broadcastsEnabled = process.env.NEXT_PUBLIC_BROADCASTS_ENABLED === "true";

  // Filter items based on membership and ownership status
  const visibleItems = navItems.filter(item => {
    if (item.memberOnly && !isMember) return false;
    if (item.ownerOnly && !isOwner) return false;
    // Gate the Admin tab behind the broadcasts feature flag
    if (item.label === "Admin" && !broadcastsEnabled) return false;
    return true;
  });

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
                  activePage === item.label.toLowerCase()
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