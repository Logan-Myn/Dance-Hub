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
    { href: `/${communitySlug}/admin/general`, label: 'General' },
    { href: `/${communitySlug}/admin/members`, label: 'Members' },
    { href: `/${communitySlug}/admin/subscriptions`, label: 'Subscriptions' },
    { href: `/${communitySlug}/admin/thread-categories`, label: 'Thread Categories' },
    { href: `/${communitySlug}/admin/emails`, label: 'Broadcasts' },
  ];

  return (
    <nav className="w-full sm:w-48 shrink-0">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-3 pl-1">
        {communityName}
      </p>
      <ul className="flex sm:flex-col gap-0.5">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'group flex items-center gap-2 pl-3 pr-2 py-2 text-sm transition-colors relative',
                  active
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full transition-all',
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
