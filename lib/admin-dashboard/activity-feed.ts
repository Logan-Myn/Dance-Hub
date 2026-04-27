import type { ActivityEvent } from './types';

/**
 * Concatenate event lists, sort newest-first by `at`, slice to `limit`.
 * Stable: equal timestamps keep their relative input order.
 */
export function mergeActivityEvents(
  lists: ActivityEvent[][],
  limit: number
): ActivityEvent[] {
  const flat: { event: ActivityEvent; idx: number }[] = [];
  let counter = 0;
  for (const list of lists) {
    for (const event of list) {
      flat.push({ event, idx: counter++ });
    }
  }
  flat.sort((a, b) => {
    const diff = b.event.at.getTime() - a.event.at.getTime();
    return diff !== 0 ? diff : a.idx - b.idx;
  });
  return flat.slice(0, limit).map((x) => x.event);
}
