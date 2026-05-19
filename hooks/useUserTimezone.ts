import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Returns the current user's saved IANA timezone string.
 * Falls back to the browser's local timezone while the profile is loading
 * or if the user is not signed in.
 */
export function useUserTimezone(): string {
  const { user } = useAuth();
  const { data } = useSWR<{ timezone?: string }>(
    user ? '/api/profile' : null,
    fetcher
  );
  return data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}
