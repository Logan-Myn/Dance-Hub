'use client';

import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';

/**
 * Reports whether the viewport is below Tailwind's `md` breakpoint (768px).
 *
 * SSR-safe: returns `false` during server render and the first client render,
 * then re-evaluates after mount. Do NOT use this hook to gate what gets rendered
 * in the layout tree — use CSS (`md:hidden` / `hidden md:block`) for that to
 * preserve SSR output and avoid hydration flash. This hook is for BEHAVIOR only:
 * deciding how an already-mounted interactive component responds to the user.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
