'use client';

import { useEffect, useRef } from 'react';
import useSWR, { mutate } from 'swr';
import { fetcher } from '@/lib/fetcher';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Invisible component. On first authenticated page load, if the user's
 * saved timezone is still the default 'UTC', auto-detects the browser
 * timezone and silently saves it. Uses a ref so it fires at most once
 * per page lifetime regardless of re-renders or tab inheritance.
 */
export function TimezoneSync() {
  const { user } = useAuth();
  const { data: profile } = useSWR<{ timezone?: string }>(
    user ? '/api/profile' : null,
    fetcher
  );
  const hasSynced = useRef(false);

  useEffect(() => {
    if (!user || !profile) return;
    if (profile.timezone && profile.timezone !== 'UTC') return;
    if (hasSynced.current) return;

    hasSynced.current = true;
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone: browserTz }),
    })
      .then(res => {
        if (res.ok) {
          mutate('/api/profile', (prev: { timezone?: string } | undefined) =>
            prev ? { ...prev, timezone: browserTz } : prev
          );
        }
      })
      .catch(() => {});
  }, [user, profile]);

  return null;
}
