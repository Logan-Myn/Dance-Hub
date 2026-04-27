import { mergeActivityEvents } from '@/lib/admin-dashboard/activity-feed';
import type { ActivityEvent } from '@/lib/admin-dashboard/types';

const make = (overrides: Partial<ActivityEvent>): ActivityEvent =>
  ({
    type: 'join',
    at: new Date(2026, 3, 1),
    userId: 'u1',
    displayName: 'X',
    avatarUrl: null,
    ...overrides,
  } as ActivityEvent);

describe('mergeActivityEvents', () => {
  it('merges multiple lists, sorts DESC by at, caps at limit', () => {
    const a: ActivityEvent[] = [
      make({ at: new Date('2026-04-10T09:00:00Z'), userId: 'a1' }),
      make({ at: new Date('2026-04-05T09:00:00Z'), userId: 'a2' }),
    ];
    const b: ActivityEvent[] = [
      make({ at: new Date('2026-04-12T09:00:00Z'), userId: 'b1', type: 'cancel' }),
      make({ at: new Date('2026-04-08T09:00:00Z'), userId: 'b2', type: 'cancel' }),
    ];
    const result = mergeActivityEvents([a, b], 3);
    expect(result.map((e) => e.userId)).toEqual(['b1', 'a1', 'b2']);
  });

  it('returns empty array when all inputs empty', () => {
    expect(mergeActivityEvents([[], [], []], 10)).toEqual([]);
  });

  it('preserves stable order between same-timestamp events', () => {
    const t = new Date('2026-04-12T09:00:00Z');
    const a: ActivityEvent[] = [make({ at: t, userId: 'a1' })];
    const b: ActivityEvent[] = [make({ at: t, userId: 'b1' })];
    const result = mergeActivityEvents([a, b], 10);
    expect(result.map((e) => e.userId)).toEqual(['a1', 'b1']);
  });
});
