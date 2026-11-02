'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { identifyUser, resetUser } from '@/lib/analytics';

/**
 * Invisible component. Names the signed-in user to analytics by their account
 * id, and forgets them on sign-out. Persistence is memory only, so this runs
 * again on every page load.
 */
export function AnalyticsIdentify() {
  const { user, error } = useAuth();
  const identified = useRef<string | null>(null);

  useEffect(() => {
    if (user && identified.current !== user.id) {
      identifyUser(user.id);
      identified.current = user.id;
    } else if (!user && !error && identified.current) {
      // A failed session refetch (rate limit, network blip) also leaves no
      // user; only a real sign-out starts a new anonymous visitor.
      resetUser();
      identified.current = null;
    }
  }, [user, error]);

  return null;
}
