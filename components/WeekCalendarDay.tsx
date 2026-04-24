"use client";

import { useEffect, useState } from "react";
import { addDays, format, isSameDay, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import LiveClassCard from "./LiveClassCard";

interface LiveClass {
  id: string;
  title: string;
  description?: string | null;
  scheduled_start_time: string;
  duration_minutes: number;
  teacher_name: string;
  teacher_avatar_url?: string | null;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  is_currently_active: boolean;
  is_starting_soon: boolean;
}

interface WeekCalendarDayProps {
  weekStart: Date;
  liveClasses: LiveClass[];
  visibleHours: number[];
  isTeacher: boolean;
  communitySlug: string;
  onTimeSlotClick: (day: Date, hour: number, minutes?: number) => void;
  onClassClick: (liveClass: LiveClass) => void;
}

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const HALF_HOURS = [0, 30];

export default function WeekCalendarDay({
  weekStart,
  liveClasses,
  visibleHours,
  isTeacher,
  communitySlug,
  onTimeSlotClick,
  onClassClick,
}: WeekCalendarDayProps) {
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Default selection: today if it lives in the current week, otherwise Sunday.
  // Reset whenever the week changes (via prev/next).
  const pickDefault = () => {
    const today = new Date();
    return weekDays.find((d) => isSameDay(d, today)) ?? weekDays[0];
  };
  const [selectedDay, setSelectedDay] = useState<Date>(pickDefault);

  useEffect(() => {
    setSelectedDay(pickDefault());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart.toISOString()]);

  const classesForDay = (day: Date) =>
    liveClasses.filter((lc) => isSameDay(parseISO(lc.scheduled_start_time), day));

  const selectedDayClasses = classesForDay(selectedDay);

  return (
    <div className="space-y-4">
      {/* Day-picker strip: 7 equal tiles, today highlighted, dot when a day has classes */}
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((day, i) => {
          const isSelected = isSameDay(day, selectedDay);
          const isToday = isSameDay(day, new Date());
          const hasClasses = classesForDay(day).length > 0;
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={cn(
                "flex flex-col items-center py-2 rounded-lg transition-colors",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : isToday
                    ? "border border-primary/40 text-foreground"
                    : "text-foreground hover:bg-muted",
              )}
            >
              <span className="text-[10px] font-medium opacity-80">
                {DAY_LETTERS[i]}
              </span>
              <span className="text-base font-semibold leading-none mt-1">
                {format(day, 'd')}
              </span>
              <span
                className={cn(
                  "mt-1 h-1 w-1 rounded-full",
                  hasClasses
                    ? isSelected
                      ? "bg-white"
                      : "bg-emerald-500"
                    : "bg-transparent",
                )}
              />
            </button>
          );
        })}
      </div>

      {/* Selected day header */}
      <h3 className="text-base font-semibold text-gray-900">
        {format(selectedDay, 'EEEE, MMMM d')}
      </h3>

      {/* Empty state for students on a day with no classes — skip the timeline
          entirely since they can't schedule anything. Teachers always see the
          timeline so they can tap free slots to add a class. */}
      {selectedDayClasses.length === 0 && !isTeacher ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No classes scheduled on {format(selectedDay, 'EEEE')}.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Check other days in this week.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {visibleHours.map((hour) => {
                const hourClasses = selectedDayClasses.filter(
                  (lc) => parseISO(lc.scheduled_start_time).getHours() === hour,
                );
                const hourEnd = new Date(selectedDay);
                hourEnd.setHours(hour, 59, 59, 999);
                const isPastHour = hourEnd < new Date();
                const isToday = isSameDay(selectedDay, new Date());

                return (
                  <div
                    key={hour}
                    className={cn(
                      "flex min-h-[64px]",
                      isPastHour
                        ? "bg-gray-50/30"
                        : isToday
                          ? "bg-blue-50/20"
                          : "bg-white",
                    )}
                  >
                    {/* Time label column */}
                    <div className="w-14 shrink-0 px-2 py-2 text-xs text-gray-500 bg-gray-50/50 border-r border-gray-200 flex items-start">
                      <span className="font-medium">
                        {format(new Date().setHours(hour, 0, 0, 0), 'h a')}
                      </span>
                    </div>

                    {/* Slots column (full remaining width) */}
                    <div className="flex-1 relative">
                      <div className="flex flex-col h-full">
                        {HALF_HOURS.map((minutes) => {
                          const slotTime = new Date(selectedDay);
                          slotTime.setHours(hour, minutes, 0, 0);
                          const isPastSlot = slotTime < new Date();
                          return (
                            <button
                              key={minutes}
                              type="button"
                              disabled={!isTeacher || isPastSlot}
                              onClick={() => {
                                if (!isPastSlot) {
                                  onTimeSlotClick(selectedDay, hour, minutes);
                                }
                              }}
                              aria-label={`${format(slotTime, 'h:mm a')} slot`}
                              className={cn(
                                "flex-1 text-left w-full",
                                minutes === 30 &&
                                  "border-t border-dashed border-gray-200",
                                isTeacher && !isPastSlot
                                  ? "active:bg-blue-50 cursor-pointer"
                                  : "cursor-default",
                              )}
                            />
                          );
                        })}
                      </div>

                      {/* Classes overlaid — same absolute-positioned pattern as
                          the desktop grid so LiveClassCard owns its own styling. */}
                      <div className="absolute inset-0 px-2 py-1 pointer-events-none">
                        {hourClasses.map((lc) => (
                          <div key={lc.id} className="pointer-events-auto">
                            <LiveClassCard
                              liveClass={lc}
                              communitySlug={communitySlug}
                              onClick={() => onClassClick(lc)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
