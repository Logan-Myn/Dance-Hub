"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  Banknote,
  BookOpen,
  FileText,
  GraduationCap,
  Hash,
  Layers,
  LayoutGrid,
  Mail,
  Settings,
  Tag,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { Offerings } from "@/lib/offerings";
import { communityPath } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Exact match for the active state (Overview is a prefix of every page). */
  exact?: boolean;
  /** A page outside Admin. */
  out?: boolean;
  off?: boolean;
  count?: number;
}

/** Admin sections, grouped. On phones it becomes a row of chips under the top bar. */
export function AdminNav({
  slug,
  offerings,
  attention,
  showEmails,
}: {
  slug: string;
  offerings: Offerings;
  attention: number;
  showEmails: boolean;
}) {
  const pathname = usePathname();
  const admin = (p = "") => communityPath(slug, `/admin${p}`);
  const groups: Array<{ title: string | null; items: Item[] }> = [
    { title: null, items: [{ href: admin(), label: "Overview", icon: LayoutGrid, exact: true, count: attention }] },
    {
      title: "Members",
      items: [
        { href: admin("/members"), label: "Members", icon: Users },
        ...(showEmails ? [{ href: admin("/emails"), label: "Emails to members", icon: Mail }] : []),
        { href: admin("/promo-codes"), label: "Promo codes", icon: Tag },
      ],
    },
    {
      title: "What you offer",
      items: [
        { href: admin("/offerings"), label: "Offerings", icon: Layers },
        { href: communityPath(slug, "/classroom"), label: "Courses", icon: BookOpen, out: true, off: !offerings.courses },
        { href: communityPath(slug, "/calendar"), label: "Live classes", icon: Video, out: true, off: !offerings.liveClasses },
        { href: communityPath(slug, "/private-lessons"), label: "Private lessons", icon: GraduationCap, out: true, off: !offerings.privateLessons },
        { href: `${communityPath(slug, "/about")}?edit=1`, label: "About page", icon: FileText, out: true },
      ],
    },
    { title: "Money", items: [{ href: admin("/subscriptions"), label: "Pricing and payouts", icon: Banknote }] },
    {
      title: "Settings",
      items: [
        { href: admin("/general"), label: "Community details", icon: Settings },
        { href: admin("/thread-categories"), label: "Post topics", icon: Hash },
      ],
    },
  ];

  return (
    <nav
      aria-label="Admin sections"
      className={cn(
        // Phones: a sticky row of chips. Desktop: a sticky sidebar.
        "sticky top-[calc(env(safe-area-inset-top)+56px)] z-20 -mx-4 flex gap-1 overflow-x-auto bg-canvas px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "md:top-[calc(env(safe-area-inset-top)+84px)] md:mx-0 md:flex-col md:gap-[18px] md:overflow-visible md:bg-transparent md:p-0"
      )}
    >
      {groups.map((g, gi) => (
        <div key={gi} className="flex shrink-0 gap-1 md:flex-col md:gap-0.5">
          {g.title && <h3 className="hidden px-2.5 pb-1 text-[12.5px] font-semibold text-ink-3 md:block">{g.title}</h3>}
          {g.items.map((item) => {
            const path = item.href.split("?")[0];
            const active = !item.out && (item.exact ? pathname === path : pathname.startsWith(path));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[36px] shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[10px] border border-line bg-surface px-2.5 text-[14px] font-medium text-ink-2 transition-colors hover:text-ink",
                  "md:min-h-[38px] md:border-transparent md:bg-transparent md:text-[14.5px] md:hover:bg-surface-2",
                  active && "border-brand-line bg-brand-soft font-semibold text-brand-ink hover:text-brand-ink md:border-transparent md:bg-brand-soft md:hover:bg-brand-soft"
                )}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0 opacity-85" aria-hidden="true" />
                <span>{item.label}</span>
                {!!item.count && (
                  <span
                    aria-label={`${item.count} ${item.count === 1 ? "item needs" : "items need"} attention`}
                    className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-live px-1.5 text-[11.5px] font-bold tabular-nums text-white"
                  >
                    {item.count}
                  </span>
                )}
                {item.off ? (
                  <span className="ml-auto hidden text-[12px] font-medium text-ink-3 md:inline">Off</span>
                ) : item.out ? (
                  <ArrowUpRight className="ml-auto hidden h-3.5 w-3.5 text-ink-3 md:block" aria-hidden="true" />
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
