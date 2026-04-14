'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mail } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AdminNav({ communitySlug }: { communitySlug: string }) {
  const pathname = usePathname();
  const items = [
    { href: `/${communitySlug}/admin/emails`, label: 'Emails', icon: Mail },
  ];

  return (
    <nav className="w-full sm:w-56 shrink-0 border-b sm:border-b-0 sm:border-r bg-muted/20">
      <ul className="flex sm:flex-col p-2 gap-1">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                  active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
