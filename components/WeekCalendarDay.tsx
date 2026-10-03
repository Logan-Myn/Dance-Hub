"use client";

import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import LiveClassCard from "./LiveClassCard";
import { dateKeyInTz, formatDayKey, hourInTz, zonedTimeToUtc } from "@/lib/calendar-week";

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
  /** The week's seven dates ('yyyy-MM-dd', Sunday first) in `timezone`. */
  weekDays: string[];
  /** The day shown, one of `weekDays`. The parent owns it so its Schedule
   *  Class button can start on the same day. */
  selectedDay: string;
  onSelectDay: (day: string) => void;
  /** The viewer's timezone; same one the week grid uses. */
  timezone: string;
  liveClasses: LiveClass[];
  visibleHours: number[];
  isTeacher: boolean;
  communitySlug: string;
  onClassClick: (liveClass: LiveClass) => void;
}

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const HALF_HOURS = [0, 30];

export default function WeekCalendarDay({
  weekDays,
  selectedDay,
  onSelectDay,
  timezone,
  liveClasses,
  visibleHours,
  isTeacher,
  communitySlug,
  onClassClick,
}: WeekCalendarDayProps) {
  const now = new Date();
  const todayKey = dateKeyInTz(now, timezone);

  const classesForDay = (day: string) =>
    liveClasses.filter((lc) => dateKeyInTz(lc.scheduled_start_time, timezone) === day);

  const selectedDayClasses = classesForDay(selectedDay);

  return (
    <div className="space-y-4">
      {/* Day-picker strip: 7 equal tiles, today highlighted, dot when a day has classes */}
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((day, i) => {
          const isSelected = day === selectedDay;
          const isToday = day === todayKey;
          const hasClasses = classesForDay(day).length > 0;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(day)}
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
                {formatDayKey(day, 'd')}
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
        {formatDayKey(selectedDay, 'EEEE, MMMM d')}
      </h3>

      {/* Empty state — nobody taps slots to schedule on mobile, so we show a
          friendlier placeholder instead of a dozen empty time rows. Teachers
          use the Schedule Class button in the header. */}
      {selectedDayClasses.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No classes scheduled on {formatDayKey(selectedDay, 'EEEE')}.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {isTeacher
                ? 'Use Schedule Class to add one.'
                : 'Check other days in this week.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {visibleHours.map((hour) => {
                const hourClasses = selectedDayClasses.filter(
                  (lc) => hourInTz(lc.scheduled_start_time, timezone) === hour,
                );
                const isPastHour = zonedTimeToUtc(selectedDay, hour, 59, timezone) < now;
                const isToday = selectedDay === todayKey;

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

                    {/* Slots column (full remaining width). Read-only on
                        mobile — teachers use the Schedule Class button in
                        the header to open the modal, so half-hour slots are
                        purely visual ruling. */}
                    <div className="flex-1 relative">
                      <div className="flex flex-col h-full">
                        {HALF_HOURS.map((minutes) => (
                          <div
                            key={minutes}
                            className={cn(
                              "flex-1",
                              minutes === 30 &&
                                "border-t border-dashed border-gray-200",
                            )}
                          />
                        ))}
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
