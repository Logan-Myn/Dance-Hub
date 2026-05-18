import {
  addDays,
  toDateString,
  getWeekDays,
  groupSlotsByDate,
  findFirstWeekWithSlots,
} from '@/lib/slot-grouping';
import type { TeacherAvailabilitySlot } from '@/types/private-lessons';

const mkSlot = (date: string, start = '09:00'): TeacherAvailabilitySlot => ({
  id: `${date}-${start}`,
  teacher_id: 't',
  community_id: 'c',
  availability_date: date,
  start_time: start,
  end_time: '10:00',
  is_active: true,
  created_at: '',
  updated_at: '',
});

describe('addDays', () => {
  it('adds days without mutating the input', () => {
    const base = new Date('2026-05-18T00:00:00');
    const out = addDays(base, 3);
    expect(toDateString(out)).toBe('2026-05-21');
    expect(toDateString(base)).toBe('2026-05-18');
  });

  it('handles negatives', () => {
    expect(toDateString(addDays(new Date('2026-05-18T00:00:00'), -1))).toBe('2026-05-17');
  });
});

describe('toDateString', () => {
  it('formats as YYYY-MM-DD using local calendar (no UTC drift)', () => {
    expect(toDateString(new Date('2026-05-18T23:30:00'))).toBe('2026-05-18');
    expect(toDateString(new Date('2026-01-05T00:00:00'))).toBe('2026-01-05');
  });
});

describe('getWeekDays', () => {
  it('returns 7 consecutive YYYY-MM-DD strings starting from the given date', () => {
    const result = getWeekDays(new Date('2026-05-18T00:00:00'));
    expect(result).toEqual([
      '2026-05-18',
      '2026-05-19',
      '2026-05-20',
      '2026-05-21',
      '2026-05-22',
      '2026-05-23',
      '2026-05-24',
    ]);
  });
});

describe('groupSlotsByDate', () => {
  it('groups slots into a Map keyed by availability_date', () => {
    const slots = [
      mkSlot('2026-05-18', '09:00'),
      mkSlot('2026-05-18', '10:00'),
      mkSlot('2026-05-20', '14:00'),
    ];
    const grouped = groupSlotsByDate(slots);
    expect(grouped.get('2026-05-18')?.map(s => s.start_time)).toEqual(['09:00', '10:00']);
    expect(grouped.get('2026-05-20')?.map(s => s.start_time)).toEqual(['14:00']);
    expect(grouped.get('2026-05-19')).toBeUndefined();
  });

  it('sorts slots within a day ascending by start_time', () => {
    const slots = [
      mkSlot('2026-05-18', '14:00'),
      mkSlot('2026-05-18', '09:00'),
      mkSlot('2026-05-18', '11:00'),
    ];
    const grouped = groupSlotsByDate(slots);
    expect(grouped.get('2026-05-18')?.map(s => s.start_time)).toEqual(['09:00', '11:00', '14:00']);
  });

  it('returns an empty map for empty input', () => {
    expect(groupSlotsByDate([]).size).toBe(0);
  });
});

describe('findFirstWeekWithSlots', () => {
  const today = new Date('2026-05-18T00:00:00');

  it('returns startFrom when slots exist within the first 7 days', () => {
    const slots = [mkSlot('2026-05-20')];
    const result = findFirstWeekWithSlots(slots, today, 30);
    expect(result && toDateString(result)).toBe('2026-05-18');
  });

  it('jumps forward to the next 7-day window when the first is empty', () => {
    const slots = [mkSlot('2026-05-27')];
    const result = findFirstWeekWithSlots(slots, today, 30);
    expect(result && toDateString(result)).toBe('2026-05-25');
  });

  it('jumps multiple windows', () => {
    const slots = [mkSlot('2026-06-12')];
    const result = findFirstWeekWithSlots(slots, today, 30);
    // windows: [05-18..05-24], [05-25..05-31], [06-01..06-07], [06-08..06-14]
    expect(result && toDateString(result)).toBe('2026-06-08');
  });

  it('returns null when no slots exist within the horizon', () => {
    const slots = [mkSlot('2026-08-01')];
    const result = findFirstWeekWithSlots(slots, today, 30);
    expect(result).toBeNull();
  });

  it('returns null for empty slots', () => {
    expect(findFirstWeekWithSlots([], today, 30)).toBeNull();
  });
});
