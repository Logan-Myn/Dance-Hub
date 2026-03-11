"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Calendar,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import useSWR from "swr";

interface CustomLink {
  title: string;
  url: string;
}

interface UpcomingClass {
  id: string;
  title: string;
  scheduled_start_time: string;
  duration_minutes: number;
  status: string;
  teacher_name: string;
  teacher_avatar_url: string | null;
  is_currently_active: boolean;
  is_starting_soon: boolean;
}

interface CommunitySidebarProps {
  customLinks: CustomLink[];
  communitySlug: string;
  creatorId: string;
  isMember: boolean;
  isCreator: boolean;
  memberStatus?: string | null;
  subscriptionStatus?: string | null;
  accessEndDate?: string | null;
  membershipPrice?: number;
  membershipEnabled?: boolean;
  stripeAccountId?: string | null;
  onLeaveClick: () => void;
  onReactivateClick: () => void;
  onJoinClick: () => void;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function formatClassTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const classDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
  const diffDays = Math.round(
    (classDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  const timeStr = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (diffDays === 0) return `Today at ${timeStr}`;
  if (diffDays === 1) return `Tomorrow at ${timeStr}`;
  if (diffDays < 7) {
    const dayName = date.toLocaleDateString([], { weekday: "long" });
    return `${dayName} at ${timeStr}`;
  }
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} at ${timeStr}`;
}

function getTimeUntil(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();

  if (diffMs <= 0) return "Starting now";

  const diffMin = Math.floor(diffMs / (1000 * 60));
  if (diffMin < 60) return `In ${diffMin} min`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `In ${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  return `In ${diffDays}d`;
}

export default function CommunitySidebar({
  customLinks,
  communitySlug,
  creatorId,
  isMember,
  isCreator,
  memberStatus,
  subscriptionStatus,
  accessEndDate,
  membershipPrice,
  membershipEnabled,
  stripeAccountId,
  onLeaveClick,
  onReactivateClick,
  onJoinClick,
}: CommunitySidebarProps) {
  const [linksExpanded, setLinksExpanded] = useState(true);
  const [, setTick] = useState(0);

  const { data: upcomingClasses } = useSWR<UpcomingClass[]>(
    `/api/community/${communitySlug}/upcoming-classes`,
    fetcher,
    { refreshInterval: 30000 }
  );

  // Re-render every minute to update relative times
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside className="sticky top-24 space-y-4">
      {/* Quick Links */}
      {customLinks && customLinks.length > 0 && (
        <div className="bg-card rounded-2xl p-4 border border-border/50 shadow-sm">
          <button
            onClick={() => setLinksExpanded(!linksExpanded)}
            className="flex items-center justify-between w-full text-sm font-semibold text-foreground mb-3"
          >
            <span>Quick Links</span>
            {linksExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {linksExpanded && (
            <div className="space-y-2">
              {customLinks.map((link, index) => (
                <Link
                  key={index}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex items-center gap-2 text-sm text-muted-foreground",
                    "py-1.5 px-2 -mx-2 rounded-lg",
                    "transition-colors duration-200",
                    "hover:bg-primary/10 hover:text-primary"
                  )}
                >
                  <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{link.title}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upcoming Classes */}
      <div className="bg-card rounded-2xl p-4 border border-border/50 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            Upcoming Classes
          </span>
        </div>

        {!upcomingClasses || upcomingClasses.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-muted-foreground">
            <Clock className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No upcoming classes</p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingClasses.map((cls) => {
              const isLive = cls.status === "live" || cls.is_currently_active;
              const isStartingSoon = cls.is_starting_soon;

              return (
                <div
                  key={cls.id}
                  className={cn(
                    "rounded-xl p-3 border transition-colors",
                    isLive
                      ? "border-red-500/30 bg-red-500/5"
                      : "border-border/50 bg-muted/30"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {cls.title}
                      </p>
                    </div>
                    {isLive && (
                      <span className="flex items-center gap-1 text-xs font-medium text-red-500 flex-shrink-0">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                        </span>
                        LIVE
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground mt-1.5">
                    {isLive
                      ? "Happening now"
                      : formatClassTime(cls.scheduled_start_time)}
                  </p>

                  {isLive || isStartingSoon ? (
                    <Link href={`/${communitySlug}/calendar`}>
                      <Button
                        size="sm"
                        className={cn(
                          "w-full mt-2 h-7 text-xs",
                          isLive
                            ? "bg-purple-600 hover:bg-purple-700 text-white"
                            : "bg-primary hover:bg-primary/90"
                        )}
                      >
                        {isLive ? "Join Now" : "Join"}
                      </Button>
                    </Link>
                  ) : (
                    <p className="text-xs text-muted-foreground/70 mt-2">
                      {getTimeUntil(cls.scheduled_start_time)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Link
          href={`/${communitySlug}/calendar`}
          className="flex items-center justify-center gap-1.5 text-xs text-primary hover:text-primary/80 mt-3 pt-3 border-t border-border/50 transition-colors"
        >
          <Calendar className="h-3 w-3" />
          View Calendar
        </Link>
      </div>

      {/* Action buttons */}
      {!isCreator && (
        <div className="bg-card rounded-2xl p-4 border border-border/50 shadow-sm">
          <div className="space-y-2">
            {subscriptionStatus === "canceling" && accessEndDate ? (
              <>
                <p className="text-xs text-center text-muted-foreground mb-2">
                  Your membership ends on{" "}
                  <span className="font-medium text-amber-600">
                    {new Date(accessEndDate).toLocaleDateString()}
                  </span>
                </p>
                <Button
                  onClick={onReactivateClick}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white"
                >
                  Rejoin Community
                </Button>
              </>
            ) : memberStatus === "inactive" ? (
              <>
                <Button
                  onClick={onReactivateClick}
                  className="w-full bg-green-500 hover:bg-green-600 text-white"
                >
                  Join Again
                </Button>
                {accessEndDate && (
                  <p className="text-xs text-center text-amber-600">
                    Access until{" "}
                    {new Date(accessEndDate).toLocaleDateString()}
                  </p>
                )}
              </>
            ) : isMember ? (
              <Button
                onClick={onLeaveClick}
                variant="outline"
                className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                Leave Community
              </Button>
            ) : (
              <Button
                onClick={onJoinClick}
                className="w-full bg-primary hover:bg-primary/90"
              >
                {membershipEnabled && membershipPrice && stripeAccountId
                  ? `Join for €${membershipPrice}/month`
                  : "Join for free"}
              </Button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
