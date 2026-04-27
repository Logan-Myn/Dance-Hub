'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function AdminNav({
  communitySlug,
  communityName,
}: {
  communitySlug: string;
  communityName: string;
}) {
  const pathname = usePathname();
  const items = [
    { href: `/${communitySlug}/admin`,                   label: 'Dashboard',         exact: true  },
    { href: `/${communitySlug}/admin/general`,           label: 'General',           exact: false },
    { href: `/${communitySlug}/admin/members`,           label: 'Members',           exact: false },
    { href: `/${communitySlug}/admin/subscriptions`,     label: 'Subscriptions',     exact: false },
    { href: `/${communitySlug}/admin/thread-categories`, label: 'Thread Categories', exact: false },
    { href: `/${communitySlug}/admin/emails`,            label: 'Broadcasts',        exact: false },
  ];

  return (
    <nav className="w-full md:w-48 md:shrink-0">
      <p className="hidden md:block text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-3 pl-1">
        {communityName}
      </p>
      <ul className="flex md:flex-col gap-0.5 overflow-x-auto scrollbar-hide md:overflow-visible -mx-1 px-1 pb-1 md:pb-0 md:mx-0 md:px-0">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="shrink-0 md:shrink">
              <Link
                href={item.href}
                className={cn(
                  'group flex items-center gap-2 pl-3 pr-3 py-2 text-sm transition-colors relative whitespace-nowrap rounded-md md:rounded-none min-h-[44px] md:min-h-0',
                  active
                    ? 'text-foreground font-medium bg-muted md:bg-transparent'
                    : 'text-muted-foreground hover:text-foreground md:hover:bg-transparent'
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'hidden md:block absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full transition-all',
                    active
                      ? 'bg-primary opacity-100'
                      : 'bg-primary/0 opacity-0 group-hover:opacity-40'
                  )}
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
