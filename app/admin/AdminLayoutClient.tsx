'use client';

import Link from 'next/link';
import { LucideLayoutDashboard, Users, MessageSquare, ChevronLeft, MessageCircle, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

const ADMIN_MENU_ITEMS = [
  { text: 'Dashboard', icon: LucideLayoutDashboard, href: '/admin' },
  { text: 'Users', icon: Users, href: '/admin/users' },
  { text: 'Communities', icon: MessageSquare, href: '/admin/communities' },
  { text: 'Threads', icon: MessageCircle, href: '/admin/threads' },
  { text: 'Courses', icon: BookOpen, href: '/admin/courses' },
];

export default function AdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "group relative flex flex-col border-r bg-background transition-all duration-300",
          isCollapsed ? "w-16" : "w-64"
        )}
      >
        <div className="flex h-16 items-center justify-between px-4 border-b">
          {!isCollapsed && <span className="font-semibold">Admin Panel</span>}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            <ChevronLeft className={cn(
              "h-4 w-4 transition-transform",
              isCollapsed && "rotate-180"
            )} />
          </Button>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {ADMIN_MENU_ITEMS.map((item) => (
            <Button
              key={item.text}
              variant="ghost"
              className="w-full justify-start"
              asChild
            >
              <Link href={item.href} className="flex items-center gap-2">
                <item.icon className="h-4 w-4" />
                {!isCollapsed && <span>{item.text}</span>}
              </Link>
            </Button>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8 pt-16">
        {children}
      </main>
    </div>
  );
}
