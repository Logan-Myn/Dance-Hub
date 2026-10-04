"use client";

import { useState } from "react";
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
import { useNotifications } from "@/hooks/use-notifications";

export default function NotificationsButton() {
  const { notifications, unreadCount, markAsRead: handleMarkAsRead, markAllAsRead: handleMarkAllAsRead } =
    useNotifications();
  const [open, setOpen] = useState(false);

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