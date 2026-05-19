"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { formatSlotTime } from '@/lib/utils';

interface TimeSlot {
  id?: string;
  start_time: string;
  end_time: string;
}

interface DayAvailability {
  date: string;
  slots: TimeSlot[];
}

interface TeacherCalendarAvailabilityProps {
  communitySlug: string;
  availability: DayAvailability[];
  selectedDate: string | null;
  onSelectDate: (dateIso: string) => void;
}

export default function TeacherCalendarAvailability({
  communitySlug,
  availability,
  selectedDate,
  onSelectDate,
}: TeacherCalendarAvailabilityProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  // Get the first day of the month and calculate calendar grid
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const startCalendar = new Date(firstDayOfMonth);
  startCalendar.setDate(startCalendar.getDate() - firstDayOfMonth.getDay());

  const calendarDays: Date[] = [];
  const current = new Date(startCalendar);

  for (let i = 0; i < 42; i++) { // 6 weeks * 7 days
    calendarDays.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  const formatDate = (date: Date) => {
    // Use local timezone to avoid date shifting issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getDayAvailability = (date: Date): DayAvailability | undefined => {
    const dateStr = formatDate(date);
    return availability.find(av => av.date === dateStr);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isPastDate = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentDate.getMonth();
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleDateClick = (date: Date) => {
    if (isPastDate(date)) return;
    onSelectDate(formatDate(date));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Teaching Availability Calendar
        </h3>
        <div className="text-xs sm:text-sm text-gray-600">
          Click on dates to set your availability
        </div>
      </div>

      {/* Calendar Header */}
      <Card>
        <CardHeader className="pb-3 sm:pb-4 px-3 sm:px-6 pt-3 sm:pt-6">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={handlePrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <CardTitle className="text-base sm:text-xl">
              {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-2 sm:px-6 pb-3 sm:pb-6">
          {/* Days of week header */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-xs sm:text-sm font-medium text-gray-500 py-2">
                <span className="sm:hidden">{day.charAt(0)}</span>
                <span className="hidden sm:inline">{day}</span>
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((date, index) => {
              const dayAvailability = getDayAvailability(date);
              const hasAvailability = dayAvailability && dayAvailability.slots.length > 0;
              const isCurrentMonthDay = isCurrentMonth(date);
              const isTodayDate = isToday(date);
              const isPast = isPastDate(date);
              const isSelected = selectedDate === formatDate(date);

              return (
                <div
                  key={index}
                  onClick={() => handleDateClick(date)}
                  className={`
                    relative min-h-[48px] sm:min-h-[80px] p-1 border rounded-lg cursor-pointer transition-all
                    ${!isCurrentMonthDay ? 'text-gray-400 bg-gray-50' : ''}
                    ${isPast ? 'cursor-not-allowed opacity-50' : ''}
                    ${isTodayDate ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}
                    ${hasAvailability ? 'bg-green-50 border-green-200' : ''}
                    ${!isPast && isCurrentMonthDay ? 'hover:bg-blue-50 hover:border-blue-300' : ''}
                    ${isSelected ? 'ring-2 ring-primary ring-offset-1' : ''}
                  `}
                >
                  <div className="text-xs sm:text-sm font-medium">
                    {date.getDate()}
                  </div>

                  {hasAvailability && (
                    <>
                      {/* Mobile: just a dot under the day number — cells are too narrow for time chips */}
                      <div className="sm:hidden mt-1 flex justify-center">
                        <div className="h-1.5 w-1.5 rounded-full bg-green-500" aria-label={`${dayAvailability.slots.length} slot${dayAvailability.slots.length !== 1 ? 's' : ''}`} />
                      </div>
                      {/* Desktop: show first two time chips + counter */}
                      <div className="hidden sm:block mt-1 space-y-1">
                        {dayAvailability.slots.slice(0, 2).map((slot, slotIndex) => (
                          <div key={slotIndex} className="text-xs bg-green-100 text-green-800 px-1 py-0.5 rounded truncate">
                            {formatSlotTime(slot.start_time)}
                          </div>
                        ))}
                        {dayAvailability.slots.length > 2 && (
                          <div className="text-xs text-green-600 font-medium">
                            +{dayAvailability.slots.length - 2} more
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
