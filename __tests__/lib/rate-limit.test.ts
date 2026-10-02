/**
 * @jest-environment node
 */
import { createRateLimiter } from '@/lib/rate-limit';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('allows up to the limit per key within the window', () => {
  const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
  expect([1, 2, 3].map(() => limiter.check('a'))).toEqual([true, true, true]);
  expect(limiter.check('a')).toBe(false);
  // Other keys have their own budget.
  expect(limiter.check('b')).toBe(true);
});

it('starts a fresh budget once the window has passed', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
  expect(limiter.check('a')).toBe(true);
  expect(limiter.check('a')).toBe(false);
  jest.advanceTimersByTime(60_000);
  expect(limiter.check('a')).toBe(true);
});

it('drops expired keys so memory does not grow without bound', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 1_000 });
  for (let i = 0; i < 100; i++) limiter.check(`k${i}`);
  expect(limiter.size()).toBe(100);
  jest.advanceTimersByTime(1_000);
  limiter.check('fresh');
  expect(limiter.size()).toBe(1);
});
