'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, BookOpen, LayoutGrid, MessagesSquare, UserRound, Users, type LucideIcon } from 'lucide-react';
import { BTN_GHOST } from '@/components/community-feed/feed-header';
import { cn } from '@/lib/utils';

const NAV: Array<{ href: string; label: string; icon: LucideIcon; exact?: boolean }> = [
  { href: '/admin', label: 'Dashboard', icon: LayoutGrid, exact: true },
  { href: '/admin/users', label: 'Users', icon: UserRound },
  { href: '/admin/communities', label: 'Communities', icon: Users },
  { href: '/admin/threads', label: 'Posts', icon: MessagesSquare },
  { href: '/admin/courses', label: 'Courses', icon: BookOpen },
];

/** Platform admin frame: a top bar, then the sections (a sidebar on desktop, a row of chips on phones). */
export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-[60px] max-w-[1400px] items-center justify-between gap-3 px-4 sm:px-8">
          <Link href="/admin" aria-label="Dance-Hub admin" className="flex items-center gap-2.5 font-display text-[17px] font-semibold text-ink">
            <span aria-hidden="true" className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-brand text-[13px] font-bold tracking-tight text-white">
              DH
            </span>
            Dance-Hub
            <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[12.5px] font-semibold text-ink-2">Admin</span>
          </Link>
          <Link href="/dashboard" className={cn(BTN_GHOST, 'h-9')}>
            <ArrowLeft aria-hidden="true" />
            <span className="hidden sm:inline">Back to Dance-Hub</span>
            <span className="sm:hidden">Back</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-start gap-4 px-4 pb-16 pt-1 sm:px-8 md:grid-cols-[208px_minmax(0,1fr)] md:gap-9 md:pt-8">
        <nav
          aria-label="Admin sections"
          className={cn(
            'sticky top-[60px] z-20 -mx-4 flex gap-1 overflow-x-auto bg-canvas px-4 py-2.5 [scrollbar-width:none] sm:-mx-8 sm:px-8 [&::-webkit-scrollbar]:hidden',
            'md:top-[92px] md:mx-0 md:flex-col md:gap-0.5 md:overflow-visible md:bg-transparent md:p-0'
          )}
        >
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[36px] shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[10px] border border-line bg-surface px-2.5 text-[14px] font-medium text-ink-2 transition-colors hover:text-ink',
                  'md:min-h-[38px] md:border-transparent md:bg-transparent md:text-[14.5px] md:hover:bg-surface-2',
                  active && 'border-brand-line bg-brand-soft font-semibold text-brand-ink hover:text-brand-ink md:border-transparent md:bg-brand-soft md:hover:bg-brand-soft'
                )}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0 opacity-85" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
