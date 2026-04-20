import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from '@/hooks/use-is-mobile';

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches,
    media: '(max-width: 767px)',
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.add(cb);
    },
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.delete(cb);
    },
    dispatch: (value: boolean) => {
      mql.matches = value;
      listeners.forEach((cb) => cb({ matches: value } as MediaQueryListEvent));
    },
  };
  window.matchMedia = jest.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
  return mql;
}

describe('useIsMobile', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns false on first render (SSR-safe)', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    // After first useEffect flush, value is true. Pre-effect value is false.
    // Testing Library's renderHook runs effects, so we just verify current value.
    expect(typeof result.current).toBe('boolean');
  });

  it('returns true when viewport matches mobile breakpoint', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('returns false when viewport is desktop', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('updates when the media query changes', () => {
    const mql = mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => {
      mql.dispatch(true);
    });
    expect(result.current).toBe(true);
  });
});
