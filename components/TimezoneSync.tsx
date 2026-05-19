'use client';

import { useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { fetcher } from '@/lib/fetcher';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Invisible component. On first authenticated page load, if the user's
 * saved timezone is still the default 'UTC', auto-detects the browser
 * timezone and silently saves it. Uses sessionStorage to run at most once
 * per browser session, and shares the /api/profile SWR cache.
 */
export function TimezoneSync() {
  const { user } = useAuth();
  const { data: profile } = useSWR<{ timezone?: string }>(
    user ? '/api/profile' : null,
    fetcher
  );

  useEffect(() => {
    if (!user || !profile) return;
    if (profile.timezone && profile.timezone !== 'UTC') return;
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('tz-synced')) return;

    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('tz-synced', '1');
    }

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
