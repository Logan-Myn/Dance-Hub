"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

interface Notification {
  id: string;
  title: string;
  message: string;
  created_at: string;
  read: boolean;
  link?: string;
  type: 'course_published' | 'course_updated' | 'announcement' | 'other';
}

const POLL_INTERVAL = 30000; // Poll every 30 seconds

export default function NotificationsButton() {
  const { session } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!session) return;

    try {
      const response = await fetch('/api/notifications');
      if (!response.ok) {
        console.error('Error fetching notifications:', response.status);
        return;
      }

      const data: Notification[] = (await response.json()) || [];

      // Skip the state update when nothing changed — otherwise the poll
      // re-renders the popover subtree every 30s for no reason.
      setNotifications((prev) => {
        if (prev.length !== data.length) return data;
        for (let i = 0; i < data.length; i++) {
          if (prev[i].id !== data[i].id || prev[i].read !== data[i].read) {
            return data;
          }
        }
        return prev;
      });
      setUnreadCount((prev) => {
        const next = data.filter((n) => !n.read).length;
        return prev === next ? prev : next;
      });
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  }, [session]);

  useEffect(() => {
    fetchNotifications();

    // Set up polling for notifications (replaces real-time subscription)
    const pollInterval = setInterval(fetchNotifications, POLL_INTERVAL);

    return () => {
      clearInterval(pollInterval);
    };
  }, [fetchNotifications]);

  const handleMarkAsRead = async (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId }),
      });

      if (!response.ok) {
        console.error('Error marking notification as read:', response.status);
        await fetchNotifications();
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
      await fetchNotifications();
    }
  };

  const handleMarkAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);

    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });

      if (!response.ok) {
        console.error('Error marking all notifications as read:', response.status);
        await fetchNotifications();
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      await fetchNotifications();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          className="relative"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-[10px] font-medium text-white flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-0" 
        align="end"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between border-b px-4 py-2">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              onClick={handleMarkAllAsRead}
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
            >
              <Check className="h-4 w-4 mr-1" />
              Mark all as read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[300px] overflow-y-auto">
          <div className="px-1">
            {notifications.length === 0 ? (
              <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={cn(
                      "flex items-start gap-4 p-4 hover:bg-muted/50 relative",
                      notification.read ? "bg-background" : "bg-muted/30"
                    )}
                  >
                    <div className="flex-1 space-y-1">
                      <a
                        href={notification.link || '#'}
                        className="text-sm font-medium leading-none hover:underline"
                        onClick={(e) => {
                          if (!notification.link) e.preventDefault();
                          setOpen(false);
                        }}
                      >
                        {notification.title}
                      </a>
                      <p className="text-sm text-muted-foreground">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {!notification.read && (
                      <Button
                        onClick={() => handleMarkAsRead(notification.id)}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
} 