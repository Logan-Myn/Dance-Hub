"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { Bell, BookOpen, Megaphone, RefreshCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications, type AppNotification } from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";
import { ICON_BTN, POP, POP_TITLE } from "./menu-styles";

const TYPE_ICONS: Record<AppNotification["type"], typeof Bell> = {
  course_published: BookOpen,
  course_updated: RefreshCw,
  announcement: Megaphone,
  other: Bell,
};

/** Bell with a dot for unread items; the panel lists them newest first. */
export default function NotificationsMenu() {
  const router = useRouter();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);

  const openItem = (n: AppNotification) => {
    if (!n.read) markAsRead(n.id);
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={ICON_BTN}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-[9px] top-2 h-2 w-2 rounded-full bg-live ring-2 ring-surface"
          />
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className={cn(POP, "w-[340px] max-w-[calc(100vw-32px)]")}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className={cn(POP_TITLE, "flex items-center justify-between")}>
          <h2>Notifications</h2>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="rounded font-sans text-[13px] font-semibold text-brand-ink hover:underline hover:underline-offset-[3px]"
            >
              Mark all read
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="px-2.5 pb-4 pt-2 text-[14px] text-ink-2">
            <p className="font-semibold text-ink">You&apos;re all caught up.</p>
            <p className="mt-0.5">New courses and announcements will show up here.</p>
          </div>
        ) : (
          <ul className="max-h-[min(420px,70vh)] overflow-y-auto">
            {notifications.map((n) => {
              const Icon = TYPE_ICONS[n.type] ?? Bell;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className="grid w-full grid-cols-[auto_1fr] items-start gap-2.5 rounded-lg p-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-0.5 grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-brand-ink"
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] leading-[1.4] text-ink">
                        {!n.read && (
                          <span className="mr-1.5 inline-block h-[7px] w-[7px] rounded-full bg-brand align-[1px]">
                            <span className="sr-only">Unread: </span>
                          </span>
                        )}
                        <span className="font-semibold">{n.title}</span>
                        {n.message ? <span className="text-ink-2"> {n.message}</span> : null}
                      </span>
                      <time dateTime={n.created_at} className="mt-0.5 block text-[12.5px] text-ink-3">
                        {formatDistanceToNowStrict(new Date(n.created_at), { addSuffix: true })}
                      </time>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
