'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Home, BookOpen, GraduationCap, Calendar, MoreHorizontal, Info, Settings, Users, User, LogOut, Repeat } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import NotificationsButton from '@/components/NotificationsButton';
import { signOut } from '@/lib/auth';
import { useAuthModal } from '@/contexts/AuthModalContext';
import { getCommunityTabs, isTabActive, type CommunityTabKey } from '@/lib/community-nav';
import type { Offerings } from '@/lib/offerings';

type MobileNavProps = {
  communitySlug: string;
  communityName: string;
  communityImageUrl: string | null;
  isMember: boolean;
  isOwner: boolean;
  isAdmin?: boolean;
  offerings: Offerings;
  user: { id: string; email?: string | null } | null;
  profile: { full_name?: string | null; avatar_url?: string | null } | null;
};


export default function MobileNav({
  communitySlug,
  communityName,
  communityImageUrl,
  isMember,
  isOwner,
  isAdmin = false,
  offerings,
  user,
  profile,
}: MobileNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { showAuthModal } = useAuthModal();
  const [moreOpen, setMoreOpen] = useState(false);

  // Same rules as the desktop top bar (lib/community-nav.ts): site admins get
  // full chrome, Admin shows for owners and site admins, switched-off
  // offerings lose their tab.
  const allTabs = getCommunityTabs({ slug: communitySlug, isMember, isOwner, isAdmin, offerings });
  const rootHref = allTabs[0].href;
  const BAR_KEYS: CommunityTabKey[] = ['community', 'classroom', 'private-lessons', 'calendar'];
  const ICONS: Partial<Record<CommunityTabKey, React.ComponentType<{ className?: string }>>> = {
    community: Home,
    classroom: BookOpen,
    'private-lessons': GraduationCap,
    calendar: Calendar,
  };
  const tabs = allTabs.filter((t) => BAR_KEYS.includes(t.key));
  const showAdmin = allTabs.some((t) => t.key === 'admin');
  const isActive = (href: string) => {
    const tab = allTabs.find((t) => t.href === href);
    return tab ? isTabActive(tab, pathname, communitySlug) : false;
  };

  const communityInitial = communityName.trim()[0]?.toUpperCase() ?? '?';
  const userInitial = (profile?.full_name ?? user?.email ?? '?').trim()[0]?.toUpperCase() ?? '?';

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Successfully signed out');
      router.push('/');
    } catch (error) {
      toast.error('Error signing out');
    }
  };

  const handleSignOutClick = async () => {
    setMoreOpen(false);
    await handleSignOut();
  };

  const handleSignInClick = () => {
    showAuthModal('signin');
    setMoreOpen(false);
  };

  return (
    <>
      {/* Top header */}
      <header className="sticky top-[env(safe-area-inset-top)] z-30 border-b border-line bg-surface/90 backdrop-blur-md md:hidden">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href={rootHref} className="flex items-center gap-2">
            <Avatar className="h-7 w-7">
              {communityImageUrl ? <AvatarImage src={communityImageUrl} alt={communityName} /> : null}
              <AvatarFallback className="text-xs font-semibold">{communityInitial}</AvatarFallback>
            </Avatar>
            <span className="font-semibold text-sm truncate max-w-[180px]">{communityName}</span>
          </Link>
          <NotificationsButton />
        </div>
      </header>

      {/* Bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
        aria-label="Primary"
      >
        <ul className="flex justify-around items-stretch">
          {tabs.map((tab) => {
            const active = isActive(tab.href);
            const Icon = ICONS[tab.key] ?? Home;
            return (
              <li key={tab.key} className="flex-1">
                <Link
                  id={`mobile-${tab.id}`}
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2',
                    active ? 'text-brand-ink' : 'text-ink-3'
                  )}
                >
                  {active && <span aria-hidden="true" className="absolute top-0 h-[3px] w-7 rounded-b bg-brand" />}
                  <Icon className="h-5 w-5" />
                  <span className={cn('text-[11px]', active ? 'font-bold' : 'font-medium')}>{tab.shortLabel}</span>
                </Link>
              </li>
            );
          })}

          <li className="flex-1">
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="More"
                  className="w-full flex flex-col items-center justify-center gap-0.5 py-2 min-h-[44px] text-muted-foreground"
                >
                  <MoreHorizontal className="h-5 w-5" />
                  <span className="text-[10px]">More</span>
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="pb-safe rounded-t-2xl">
                <SheetHeader className="sr-only">
                  <SheetTitle>More menu</SheetTitle>
                  <SheetDescription>
                    Navigate to community, account, or admin sections.
                  </SheetDescription>
                </SheetHeader>
                {/* Community section */}
                <div className="flex items-center gap-3 pb-4 border-b border-border/50 mb-2">
                  <Avatar className="h-10 w-10">
                    {communityImageUrl ? <AvatarImage src={communityImageUrl} alt={communityName} /> : null}
                    <AvatarFallback>{communityInitial}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{communityName}</div>
                    <div className="text-xs text-muted-foreground">Community</div>
                  </div>
                </div>

                <ul className="flex flex-col py-2">
                  <MoreItem href={`/${communitySlug}/about`} icon={Info} label="About" onNavigate={() => setMoreOpen(false)} />
                  {showAdmin ? (
                    <MoreItem
                      href={`/${communitySlug}/admin`}
                      icon={Settings}
                      label="Admin"
                      onNavigate={() => setMoreOpen(false)}
                      highlight
                    />
                  ) : null}
                </ul>

                <div className="border-t border-border/50" />

                <ul className="flex flex-col py-2">
                  <MoreItem href="/discovery" icon={Repeat} label="Switch community" onNavigate={() => setMoreOpen(false)} />
                  <MoreItem href="/dashboard" icon={Users} label="My Dashboard" onNavigate={() => setMoreOpen(false)} />
                  {user ? (
                    <MoreItem
                      href="/dashboard/settings"
                      icon={Settings}
                      label="Settings"
                      onNavigate={() => setMoreOpen(false)}
                    />
                  ) : null}
                  {user ? (
                    <MoreAction
                      icon={LogOut}
                      label="Sign out"
                      onClick={handleSignOutClick}
                      destructive
                    />
                  ) : (
                    <MoreAction icon={User} label="Sign in" onClick={handleSignInClick} />
                  )}
                </ul>

                {/* Minimal user identity chip */}
                {user ? (
                  <div className="flex items-center gap-3 pt-3 border-t border-border/50 mt-2">
                    <Avatar className="h-8 w-8">
                      {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt={profile.full_name ?? 'You'} /> : null}
                      <AvatarFallback className="text-xs">{userInitial}</AvatarFallback>
                    </Avatar>
                    <div className="text-xs text-muted-foreground truncate">{profile?.full_name ?? user.email}</div>
                  </div>
                ) : null}
              </SheetContent>
            </Sheet>
          </li>
        </ul>
      </nav>
    </>
  );
}

type MoreItemBaseProps = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  highlight?: boolean;
  destructive?: boolean;
};

function MoreItem({
  href,
  icon: Icon,
  label,
  onNavigate,
  highlight,
  destructive,
}: MoreItemBaseProps & { href: string; onNavigate: () => void }) {
  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        className={cn(
          'flex items-center gap-3 py-3 text-sm min-h-[44px]',
          highlight && 'text-primary font-medium',
          destructive && 'text-destructive'
        )}
      >
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </Link>
    </li>
  );
}

function MoreAction({
  icon: Icon,
  label,
  onClick,
  highlight,
  destructive,
}: MoreItemBaseProps & { onClick: () => void | Promise<void> }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'w-full flex items-center gap-3 py-3 text-sm min-h-[44px] text-left',
          highlight && 'text-primary font-medium',
          destructive && 'text-destructive'
        )}
      >
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </button>
    </li>
  );
}
