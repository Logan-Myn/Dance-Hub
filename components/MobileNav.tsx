'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Bell, Home, BookOpen, GraduationCap, Calendar, MoreHorizontal, Info, Settings, Users, User, LogOut, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

type MobileNavProps = {
  communitySlug: string;
  communityName: string;
  communityImageUrl: string | null;
  isMember: boolean;
  isOwner: boolean;
  user: { id: string; email?: string | null } | null;
  profile: { full_name?: string | null; avatar_url?: string | null } | null;
};

type Tab = {
  key: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  memberOnly?: boolean;
};

export default function MobileNav({
  communitySlug,
  communityName,
  communityImageUrl,
  isMember,
  isOwner,
  user,
  profile,
}: MobileNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const broadcastsEnabled = process.env.NEXT_PUBLIC_BROADCASTS_ENABLED === 'true';
  const showAdmin = isOwner && broadcastsEnabled;

  const rootHref = `/${communitySlug}`;
  const allTabs: Tab[] = [
    { key: 'community', label: 'Community', href: rootHref, icon: Home },
    { key: 'classroom', label: 'Classroom', href: `/${communitySlug}/classroom`, icon: BookOpen, memberOnly: true },
    { key: 'lessons', label: 'Lessons', href: `/${communitySlug}/private-lessons`, icon: GraduationCap },
    { key: 'calendar', label: 'Calendar', href: `/${communitySlug}/calendar`, icon: Calendar, memberOnly: true },
  ];
  const tabs = allTabs.filter((t) => !t.memberOnly || isMember);

  const isActive = (href: string) =>
    href === rootHref ? pathname === rootHref : pathname?.startsWith(href) ?? false;

  const communityInitial = communityName.trim()[0]?.toUpperCase() ?? '?';
  const userInitial = (profile?.full_name ?? user?.email ?? '?').trim()[0]?.toUpperCase() ?? '?';

  return (
    <>
      {/* Top header */}
      <header className="bg-card border-b border-border/50 sticky top-0 z-30 backdrop-blur-sm bg-card/95 md:hidden">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href={rootHref} className="flex items-center gap-2">
            <Avatar className="h-7 w-7">
              {communityImageUrl ? <AvatarImage src={communityImageUrl} alt={communityName} /> : null}
              <AvatarFallback className="text-xs font-semibold">{communityInitial}</AvatarFallback>
            </Avatar>
            <span className="font-semibold text-sm truncate max-w-[180px]">{communityName}</span>
          </Link>
          <Link
            href="/notifications"
            aria-label="Notifications"
            className="p-2 rounded-full hover:bg-muted"
          >
            <Bell className="h-5 w-5" />
          </Link>
        </div>
      </header>

      {/* Bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border/50 pb-safe"
        aria-label="Primary"
      >
        <ul className="flex justify-around items-stretch">
          {tabs.map((tab) => {
            const active = isActive(tab.href);
            const Icon = tab.icon;
            return (
              <li key={tab.key} className="flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 py-2 min-h-[44px]',
                    active ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className={cn('text-[10px]', active && 'font-semibold')}>{tab.label}</span>
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
                    <MoreItem href="/profile" icon={User} label="Profile" onNavigate={() => setMoreOpen(false)} />
                  ) : null}
                  {user ? (
                    <MoreItem href="/auth/sign-out" icon={LogOut} label="Sign out" onNavigate={() => setMoreOpen(false)} destructive />
                  ) : (
                    <MoreItem href="/auth/sign-in" icon={User} label="Sign in" onNavigate={() => setMoreOpen(false)} />
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

function MoreItem({
  href,
  icon: Icon,
  label,
  onNavigate,
  highlight,
  destructive,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onNavigate: () => void;
  highlight?: boolean;
  destructive?: boolean;
}) {
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
