import { communityPath } from "@/lib/safe-redirect";
import type { Offerings } from "@/lib/offerings";

export type CommunityTabKey =
  | "community"
  | "classroom"
  | "private-lessons"
  | "calendar"
  | "about"
  | "admin";

export interface CommunityTab {
  key: CommunityTabKey;
  label: string;
  /** Label for the phone tab bar. */
  shortLabel: string;
  href: string;
  /** Element id; the onboarding tour (lib/tourSteps.ts) targets these. */
  id: string;
}

export function getCommunityTabs({
  slug,
  isMember,
  isOwner,
  isAdmin,
  offerings,
}: {
  slug: string;
  isMember: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  offerings: Offerings;
}): CommunityTab[] {
  // Site admins get the same tabs as members and owners so they can moderate.
  const full = isMember || isOwner || isAdmin;
  const manager = isOwner || isAdmin;
  const tab = (key: CommunityTabKey, label: string, shortLabel: string, rest: string): CommunityTab => ({
    key,
    label,
    shortLabel,
    href: communityPath(slug, rest),
    id: `tab-${key}`,
  });

  const tabs: CommunityTab[] = [tab("community", "Community", "Community", "")];
  if (full && offerings.courses) tabs.push(tab("classroom", "Classroom", "Classroom", "/classroom"));
  if (offerings.privateLessons) tabs.push(tab("private-lessons", "Private lessons", "Lessons", "/private-lessons"));
  if (full && offerings.liveClasses) tabs.push(tab("calendar", "Calendar", "Calendar", "/calendar"));
  tabs.push(tab("about", "About", "About", "/about"));
  if (manager) tabs.push(tab("admin", "Admin", "Admin", "/admin"));
  return tabs;
}

// usePathname may hand back encoded or decoded paths; compare decoded forms.
// A malformed escape (a literal "%") falls back to the raw string.
function safeDecode(path: string): string {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

export function isTabActive(tab: CommunityTab, pathname: string | null, slug: string): boolean {
  if (!pathname) return false;
  const path = safeDecode(pathname);
  const href = safeDecode(tab.href);
  if (href === safeDecode(communityPath(slug))) return path === href;
  return path === href || path.startsWith(`${href}/`);
}
