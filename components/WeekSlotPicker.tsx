"use client";

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { TeacherAvailabilitySlot } from '@/types/private-lessons';
import {
  addDays,
  getWeekDays,
  groupSlotsByDate,
  findFirstWeekWithSlots,
} from '@/lib/slot-grouping';
import { formatSlotTime, cn } from '@/lib/utils';
import { naiveToUtc, formatInTz, tzOffsetLabel } from '@/lib/timezone';

const HORIZON_DAYS = 30;
const DAY_ABBREV = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

type WeekSlotPickerProps = {
  slots: TeacherAvailabilitySlot[];
  selectedSlotId: string | null;
  onSelect: (slot: TeacherAvailabilitySlot) => void;
  loading?: boolean;
  studentTimezone?: string;
};

function todayAtMidnight(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

function formatWeekRangeLabel(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const startLabel = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = sameMonth
    ? String(end.getDate())
    : end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}

export function WeekSlotPicker({ slots, selectedSlotId, onSelect, loading, studentTimezone }: WeekSlotPickerProps) {
  const today = useMemo(() => todayAtMidnight(), []);
  const slotsByDate = useMemo(() => groupSlotsByDate(slots), [slots]);

  const initialWeekStart = useMemo(
    () => findFirstWeekWithSlots(slots, today, HORIZON_DAYS) ?? today,
    [slots, today]
  );

  const hasAnyAvailability = useMemo(
    () => findFirstWeekWithSlots(slots, today, HORIZON_DAYS) !== null,
    [slots, today]
  );

  const [weekStart, setWeekStart] = useState<Date>(initialWeekStart);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    setWeekStart(initialWeekStart);
    const firstAvailable = getWeekDays(initialWeekStart).find((d) => slotsByDate.has(d));
    setSelectedDate(firstAvailable ?? null);
  }, [initialWeekStart, slotsByDate]);

  if (loading) {
    return (
      <div data-testid="week-slot-picker-skeleton" className="space-y-3">
        <div className="h-7 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 w-20 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!hasAnyAvailability) {
    return (
      <div className="text-center py-4 text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg">
        No availability in the next 30 days. Please contact the teacher directly.
      </div>
    );
  }

  const weekDays = getWeekDays(weekStart);
  const horizonEnd = addDays(today, HORIZON_DAYS - 1);
  const canGoPrev = weekStart > today;
  const canGoNext = addDays(weekStart, 7) <= horizonEnd;

  const goPrev = () => {
    const next = addDays(weekStart, -7);
    const clamped = next < today ? today : next;
    setWeekStart(clamped);
    const firstAvailable = getWeekDays(clamped).find((d) => slotsByDate.has(d));
    setSelectedDate(firstAvailable ?? null);
  };

  const goNext = () => {
    const next = addDays(weekStart, 7);
    setWeekStart(next);
    const firstAvailable = getWeekDays(next).find((d) => slotsByDate.has(d));
    setSelectedDate(firstAvailable ?? null);
  };

  const selectedSlots = selectedDate ? slotsByDate.get(selectedDate) ?? [] : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canGoPrev}
          aria-label="Previous week"
          className="p-1.5 rounded-md border border-gray-200 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-sm font-medium">{formatWeekRangeLabel(weekStart)}</div>
        <button
          type="button"
          onClick={goNext}
          disabled={!canGoNext}
          aria-label="Next week"
          className="p-1.5 rounded-md border border-gray-200 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((date) => {
          const d = new Date(`${date}T00:00:00`);
          const dayLabel = DAY_ABBREV[d.getDay()];
          const dateNum = d.getDate();
          const hasSlots = slotsByDate.has(date);
          const isSelected = selectedDate === date;

          return (
            <button
              key={date}
              type="button"
              onClick={() => hasSlots && setSelectedDate(date)}
              disabled={!hasSlots}
              aria-label={`${dayLabel} ${dateNum}`}
              aria-pressed={isSelected}
              className={cn(
                'flex flex-col items-center py-2 rounded-lg border transition-colors',
                isSelected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : hasSlots
                  ? 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 text-gray-400 cursor-not-allowed'
              )}
            >
              <span className="text-[10px] font-medium tracking-wide">{dayLabel}</span>
              <span className="text-sm font-semibold">{dateNum}</span>
              {hasSlots && <span className="w-1 h-1 rounded-full bg-blue-500 mt-1" />}
            </button>
          );
        })}
      </div>

      {selectedDate && selectedSlots.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </div>
            {studentTimezone && (
              <div className="text-xs text-gray-400">
                Times in {tzOffsetLabel(studentTimezone)}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedSlots.map((slot) => {
              const isSelected = slot.id === selectedSlotId;
              const displayTime = studentTimezone
                ? formatInTz(
                    naiveToUtc(
                      `${slot.availability_date}T${slot.start_time}`,
                      slot.teacher_timezone ?? 'UTC'
                    ),
                    studentTimezone,
                    'h:mm a'
                  )
                : formatSlotTime(slot.start_time);
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => onSelect(slot)}
                  aria-pressed={isSelected}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-sm transition-colors',
                    isSelected
                      ? 'border-blue-500 bg-blue-500 text-white'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  )}
                >
                  {displayTime}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-3 text-sm text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg">
          No slots this week. Try Next week.
        </div>
      )}
    </div>
  );
}
