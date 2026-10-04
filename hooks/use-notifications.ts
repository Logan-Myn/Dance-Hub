"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";
import { useAuth } from "@/contexts/AuthContext";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  created_at: string;
  read: boolean;
  link?: string;
  type: "course_published" | "course_updated" | "announcement" | "other";
}

const POLL_INTERVAL = 30000; // Poll every 30 seconds

async function fetchNotifications(url: string): Promise<AppNotification[]> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`Error fetching notifications: ${response.status}`);
  return ((await response.json()) as AppNotification[] | null) ?? [];
}

async function patchNotifications(body: Record<string, unknown>) {
  const response = await fetch("/api/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Error updating notifications: ${response.status}`);
}

/** The signed-in user's notifications, polled, with optimistic read marking. */
export function useNotifications() {
  const { session } = useAuth();
  const { data, mutate } = useSWR(session ? "/api/notifications" : null, fetchNotifications, {
    refreshInterval: POLL_INTERVAL,
    // A failed poll keeps the last list; the next poll tries again.
    shouldRetryOnError: false,
  });
  const notifications = useMemo(() => data ?? [], [data]);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const update = useCallback(
    async (body: Record<string, unknown>, apply: (list: AppNotification[]) => AppNotification[]) => {
      try {
        await mutate(
          async (current) => {
            await patchNotifications(body);
            return apply(current ?? []);
          },
          { optimisticData: (current) => apply(current ?? []), rollbackOnError: true, revalidate: false }
        );
      } catch (error) {
        console.error(error);
      }
    },
    [mutate]
  );

  const markAsRead = useCallback(
    (notificationId: string) =>
      update({ notificationId }, (list) => list.map((n) => (n.id === notificationId ? { ...n, read: true } : n))),
    [update]
  );

  const markAllAsRead = useCallback(
    () => update({ markAllRead: true }, (list) => list.map((n) => ({ ...n, read: true }))),
    [update]
  );

  return { notifications, unreadCount, markAsRead, markAllAsRead };
}
