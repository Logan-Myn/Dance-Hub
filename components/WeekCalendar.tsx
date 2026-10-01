"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import LiveClassModal from "./LiveClassModal";
import LiveClassCard from "./LiveClassCard";
import LiveClassDetailsModal from "./LiveClassDetailsModal";
import WeekCalendarDay from "./WeekCalendarDay";
import {
  dateKeyInTz,
  formatDayKey,
  hourInTz,
  isInRange,
  rangeContains,
  weekDayKeys,
  weekRangeUtc,
  weekdayOfKey,
  weekStartKey,
  zonedTimeToUtc,
  type UtcRange,
} from "@/lib/calendar-week";

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

interface WeekCalendarProps {
  communityId: string;
  communitySlug: string;
  isTeacher: boolean;
  /** Server-fetched classes covering `initialRange` (UTC instants). When
   *  that range covers the viewer's current week we skip the first client
   *  fetch and paint without a spinner. */
  initialClasses?: LiveClass[];
  initialRange?: { start: string; end: string };
  /** IANA timezone string for the viewer. Falls back to the user's saved
   *  timezone (via useUserTimezone) and then to browser-local if omitted.
   *  The week, its days and the slots are all in this timezone. */
  userTimezone?: string;
}

const DEFAULT_MIN_HOUR = 6;  // default start of visible day: 6 AM
const DEFAULT_MAX_HOUR = 23; // default end of visible day:   11 PM
const HALF_HOURS = [0, 30]; // Support 30-minute increments
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Classes starting in [range.start, range.end), or null if the request failed. */
async function fetchClassesInRange(communitySlug: string, range: UtcRange): Promise<LiveClass[] | null> {
  try {
    const start = encodeURIComponent(range.start.toISOString());
    const end = encodeURIComponent(range.end.toISOString());
    const response = await fetch(
      `/api/community/${communitySlug}/live-classes?start=${start}&end=${end}`
    );
    return response.ok ? await response.json() : null;
  } catch (error) {
    console.error('Error fetching live classes:', error);
    return null;
  }
}

export default function WeekCalendar({ communityId, communitySlug, isTeacher, initialClasses, initialRange, userTimezone: userTimezoneProp }: WeekCalendarProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const hookTimezone = useUserTimezone();
  const userTimezone = userTimezoneProp ?? hookTimezone;
  // Weeks away from the current one. Kept as an offset (not a date) so the
  // week follows the timezone if it changes once the profile loads.
  const [weekOffset, setWeekOffset] = useState(0);
  const now = new Date();
  const todayKey = dateKeyInTz(now, userTimezone);
  const { weekDays, weekRange } = useMemo(() => {
    const startKey = weekStartKey(todayKey, weekOffset);
    return { weekDays: weekDayKeys(startKey), weekRange: weekRangeUtc(startKey, userTimezone) };
  }, [todayKey, weekOffset, userTimezone]);

  const [liveClasses, setLiveClasses] = useState<LiveClass[]>(initialClasses ?? []);
  // The range (UTC instants) that liveClasses was loaded for.
  const [loadedRange, setLoadedRange] = useState<UtcRange | null>(() =>
    initialClasses && initialRange
      ? { start: new Date(initialRange.start), end: new Date(initialRange.end) }
      : null
  );
  const weekCovered = !!loadedRange && rangeContains(loadedRange, weekRange);
  // Week (start instant) whose fetch failed; we stop the spinner for it.
  const [failedWeek, setFailedWeek] = useState<number | null>(null);
  const loading = !weekCovered && failedWeek !== weekRange.start.getTime();
  const fetchSeq = useRef(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDateTime, setSelectedDateTime] = useState<Date | null>(null);
  const [selectedClass, setSelectedClass] = useState<LiveClass | null>(null);
  const [editingClass, setEditingClass] = useState<LiveClass | null>(null);

  // The loaded data can span more than this week (the server pre-fetches a
  // wider window), so only keep classes that start inside it.
  const weekClasses = useMemo(
    () => liveClasses.filter((lc) => isInRange(lc.scheduled_start_time, weekRange)),
    [liveClasses, weekRange]
  );

  // Dynamic visible hour range: default 6 AM - 11 PM, but extend to cover any
  // scheduled class in the currently-viewed week. Students in other timezones
  // from the teacher may see classes land at 1 AM or 4 AM local time; we must
  // not hide those rows from them.
  const visibleHours = useMemo(() => {
    let minHour = DEFAULT_MIN_HOUR;
    let maxHour = DEFAULT_MAX_HOUR;
    for (const liveClass of weekClasses) {
      const classStart = new Date(liveClass.scheduled_start_time);
      const classEnd = new Date(classStart.getTime() + liveClass.duration_minutes * 60000);
      const startHour = hourInTz(classStart, userTimezone);
      // If the class crosses midnight, its end date is the next day — in that
      // case cap end-hour at 23 so we don't jump tomorrow's visible range.
      const crossesMidnight = dateKeyInTz(classEnd, userTimezone) !== dateKeyInTz(classStart, userTimezone);
      const endHour = crossesMidnight ? 23 : hourInTz(classEnd, userTimezone);
      if (startHour < minHour) minHour = startHour;
      if (endHour > maxHour) maxHour = endHour;
    }
    minHour = Math.max(0, minHour);
    maxHour = Math.min(23, maxHour);
    const length = maxHour - minHour + 1;
    return Array.from({ length }, (_, i) => i + minHour);
  }, [weekClasses, userTimezone]);

  const fetchLiveClasses = () => {
    const range = weekRange;
    const seq = ++fetchSeq.current;
    return fetchClassesInRange(communitySlug, range).then((data) => {
      // A newer request (e.g. the user moved to another week) wins.
      if (seq !== fetchSeq.current) return;
      if (data) {
        setLiveClasses(data);
        setLoadedRange(range);
      } else {
        setFailedWeek(range.start.getTime());
      }
    });
  };

  // Fetch whenever the viewed week isn't inside the data we already have
  // (first load without server data, week navigation, timezone change).
  useEffect(() => {
    if (weekCovered) return;
    fetchLiveClasses();
  }, [weekRange, communityId]);

  // Refresh when the teacher ends a class early from the video page.
  useEffect(() => {
    const channel = new BroadcastChannel("live-class-updates");
    channel.onmessage = (e) => {
      if (e.data?.type === "class-ended") fetchLiveClasses();
    };
    return () => channel.close();
  }, [weekRange, communitySlug]);

  const navigateWeek = (direction: 'prev' | 'next') => {
    setWeekOffset(prev => prev + (direction === 'next' ? 1 : -1));
  };

  const handleTimeSlotClick = (day: string, hour: number, minutes: number = 0) => {
    if (!isTeacher) return;

    // The grid is drawn in the viewer's timezone, so the slot is that
    // wall-clock time there, whatever the browser's own timezone is.
    setSelectedDateTime(zonedTimeToUtc(day, hour, minutes, userTimezone));
    setShowCreateModal(true);
  };

  const classesByDayHour = useMemo(() => {
    const map = new Map<string, typeof liveClasses>();
    for (const liveClass of weekClasses) {
      const key = `${dateKeyInTz(liveClass.scheduled_start_time, userTimezone)}-${hourInTz(liveClass.scheduled_start_time, userTimezone)}`;
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(liveClass);
      } else {
        map.set(key, [liveClass]);
      }
    }
    return map;
  }, [weekClasses, userTimezone]);

  const getClassesForTimeSlot = (day: string, hour: number) =>
    classesByDayHour.get(`${day}-${hour}`) ?? [];

  const handleClassCreated = () => {
    fetchLiveClasses();
    // Purge the Next.js Router Cache so navigating away from /calendar and
    // back picks up the new class instead of serving the pre-create RSC.
    router.refresh();
    setShowCreateModal(false);
    setSelectedDateTime(null);
  };

  const handleClassUpdated = () => {
    fetchLiveClasses();
    router.refresh();
    setEditingClass(null);
  };

  const handleClassDeleted = () => {
    fetchLiveClasses();
    router.refresh();
    setSelectedClass(null);
  };

  const openEditFromDetails = (liveClass: LiveClass) => {
    setSelectedClass(null);
    setEditingClass(liveClass);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Week Navigation */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateWeek('prev')}
            aria-label="Previous week"
            className="shrink-0"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <h2 className="text-base sm:text-xl font-semibold text-gray-900 truncate">
            {formatDayKey(weekDays[0], 'MMM d')} - {formatDayKey(weekDays[6], 'MMM d, yyyy')}
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateWeek('next')}
            aria-label="Next week"
            className="shrink-0"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>

        {isTeacher && (
          <Button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 shrink-0"
            aria-label="Schedule class"
          >
            <PlusIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Schedule Class</span>
          </Button>
        )}
      </div>

      {/* Mobile: day view (day-picker strip + selected-day timeline) */}
      {isMobile ? (
        <WeekCalendarDay
          // Remount per week so the selected day resets to today / Sunday.
          key={weekDays[0]}
          weekDays={weekDays}
          timezone={userTimezone}
          liveClasses={weekClasses}
          visibleHours={visibleHours}
          isTeacher={isTeacher}
          communitySlug={communitySlug}
          onClassClick={(lc) => setSelectedClass(lc)}
        />
      ) : (
      /* Desktop: the original week grid */
      <Card className="shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Day headers */}
            <div className="grid grid-cols-8 bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              <div className="px-3 py-2 text-xs font-medium text-gray-500 border-r border-gray-200 bg-gray-50">
                <div className="h-10 flex items-center">Time</div>
              </div>

              {weekDays.map((day) => {
                const isToday = day === todayKey;
                return (
                  <div
                    key={day}
                    className={`px-2 py-2 text-center border-r border-gray-200 last:border-r-0 ${
                      isToday ? 'bg-blue-50' : 'bg-gray-50'
                    }`}
                  >
                    <div className="text-[10px] font-medium text-gray-600 uppercase tracking-wide">
                      {DAYS[weekdayOfKey(day)].substring(0, 3)}
                    </div>
                    <div className={`text-2xl font-bold mt-0.5 ${
                      isToday ? 'text-blue-600' : 'text-gray-900'
                    }`}>
                      {formatDayKey(day, 'd')}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time slots */}
            <div className="divide-y divide-gray-100">
              {visibleHours.map((hour) => (
                <div key={hour} className="grid grid-cols-8 min-h-[60px]">
                  {/* Time label */}
                  <div className="px-3 py-2 text-xs text-gray-500 border-r border-gray-200 flex items-start bg-gray-50/50">
                    <span className="font-medium">{format(new Date().setHours(hour, 0, 0, 0), 'h a')}</span>
                  </div>

                  {/* Day slots */}
                  {weekDays.map((day) => {
                    const classes = getClassesForTimeSlot(day, hour);
                    const isPastHour = zonedTimeToUtc(day, hour, 59, userTimezone) < now;
                    const isToday = day === todayKey;

                    return (
                      <div
                        key={`${day}-${hour}`}
                        className={`border-r border-gray-100 last:border-r-0 relative ${
                          classes.length > 0 ? 'z-10' : ''
                        } ${
                          isPastHour ? 'bg-gray-50/30' : isToday ? 'bg-blue-50/20' : 'bg-white'
                        }`}
                      >
                        {/* Two half-hour slots */}
                        <div className="flex flex-col h-full">
                          {HALF_HOURS.map((minutes) => {
                            const isPastSlot = zonedTimeToUtc(day, hour, minutes, userTimezone) < now;

                            return (
                              <div
                                key={`${day}-${hour}-${minutes}`}
                                className={`flex-1 px-1.5 py-0.5 group relative ${
                                  minutes === 30 ? 'border-t border-dashed border-gray-200' : ''
                                } ${
                                  isTeacher && !isPastSlot
                                    ? 'hover:bg-blue-50/50 cursor-pointer'
                                    : ''
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isPastSlot) handleTimeSlotClick(day, hour, minutes);
                                }}
                              >
                                {/* Add class hint for teachers */}
                                {isTeacher && !isPastSlot && classes.length === 0 && (
                                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                    <PlusIcon className="h-4 w-4 text-blue-400" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Classes are positioned absolutely to span across half-hours */}
                        <div className="absolute inset-0 px-1.5 py-1 pointer-events-none">
                          {classes.map((liveClass) => (
                            <div key={liveClass.id} className="pointer-events-auto">
                              <LiveClassCard
                                liveClass={liveClass}
                                communitySlug={communitySlug}
                                onClick={() => setSelectedClass(liveClass)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Create Live Class Modal */}
      {showCreateModal && (
        <LiveClassModal
          communityId={communityId}
          communitySlug={communitySlug}
          initialDateTime={selectedDateTime}
          onClose={() => {
            setShowCreateModal(false);
            setSelectedDateTime(null);
          }}
          onClassCreated={handleClassCreated}
        />
      )}

      {/* Live Class Details Modal */}
      {selectedClass && (
        <LiveClassDetailsModal
          liveClass={selectedClass}
          communitySlug={communitySlug}
          isTeacher={isTeacher}
          onClose={() => setSelectedClass(null)}
          onEdit={openEditFromDetails}
          onDeleted={handleClassDeleted}
        />
      )}

      {/* Edit Live Class Modal (reuses the create modal in edit mode) */}
      {editingClass && (
        <LiveClassModal
          communityId={communityId}
          communitySlug={communitySlug}
          existingClass={editingClass}
          onClose={() => setEditingClass(null)}
          onClassUpdated={handleClassUpdated}
        />
      )}
    </div>
  );
}