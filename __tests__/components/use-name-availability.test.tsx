import { act, renderHook } from '@testing-library/react';
import { useNameAvailability } from '@/hooks/use-name-availability';

type Reply = { available: boolean; reason?: string };

/** fetch that answers each request when told to, so tests control the order. */
function controlledFetch() {
  const pending: Array<{ url: string; resolve: (r: Reply) => void }> = [];
  global.fetch = jest.fn(
    (url: string) =>
      new Promise((resolveFetch) => {
        pending.push({ url, resolve: (r) => resolveFetch({ ok: true, json: async () => r } as Response) });
      })
  ) as unknown as typeof fetch;
  return pending;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('says nothing for short names and explains names that make no address', () => {
  controlledFetch();
  const { result, rerender } = renderHook(({ name }) => useNameAvailability(name), { initialProps: { name: 'ab' } });
  expect(result.current).toEqual({ status: 'idle', message: null, slug: null });
  rerender({ name: 'Ñññ' });
  expect(result.current.status).toBe('invalid');
  rerender({ name: 'Onboarding' });
  expect(result.current.status).toBe('invalid');
  expect(result.current.message).toMatch(/reserved/);
});

it('shows the address right away and checks once the owner stops typing', async () => {
  const pending = controlledFetch();
  const { result, rerender } = renderHook(({ name }) => useNameAvailability(name), { initialProps: { name: 'Salsa' } });
  rerender({ name: 'Salsa Ta' });
  rerender({ name: 'Salsa Tallinn' });
  expect(result.current).toEqual({ status: 'checking', message: null, slug: 'salsa-tallinn' });
  expect(global.fetch).not.toHaveBeenCalled();

  act(() => jest.advanceTimersByTime(400));
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(pending[0].url).toContain('slug=salsa-tallinn');

  await act(async () => pending[0].resolve({ available: true }));
  expect(result.current).toEqual({ status: 'available', message: null, slug: 'salsa-tallinn' });
});

it('ignores an answer for a name the owner has already changed', async () => {
  const pending = controlledFetch();
  const { result, rerender } = renderHook(({ name }) => useNameAvailability(name), { initialProps: { name: 'Bachata' } });
  act(() => jest.advanceTimersByTime(400));
  rerender({ name: 'Bachata Flow' });
  act(() => jest.advanceTimersByTime(400));
  expect(pending).toHaveLength(2);

  // The newer name answers first, then the old one arrives late.
  await act(async () => pending[1].resolve({ available: true }));
  await act(async () => pending[0].resolve({ available: false, reason: 'A community with this name already exists' }));
  expect(result.current).toEqual({ status: 'available', message: null, slug: 'bachata-flow' });
});

it('reports a taken name with the server reason', async () => {
  const pending = controlledFetch();
  const { result } = renderHook(() => useNameAvailability('BachataFlow'));
  act(() => jest.advanceTimersByTime(400));
  await act(async () => pending[0].resolve({ available: false, reason: 'A community with this name already exists' }));
  expect(result.current).toEqual({ status: 'taken', message: 'A community with this name already exists', slug: 'bachataflow' });
});
