"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import TeacherCalendarAvailability from '@/components/TeacherCalendarAvailability';
import { AvailabilityDayPanel } from './AvailabilityDayPanel';

interface AvailabilityTabProps {
  communitySlug: string;
}

interface TimeSlot {
  id?: string;
  start_time: string;
  end_time: string;
}

interface DayAvailability {
  date: string;
  slots: TimeSlot[];
}

export function AvailabilityTab({ communitySlug }: AvailabilityTabProps) {
  const [availability, setAvailability] = useState<DayAvailability[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const fetchAvailability = useCallback(async () => {
    setIsLoading(true);
    try {
      const today = new Date();
      const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const ninetyDaysOut = new Date(today);
      ninetyDaysOut.setDate(today.getDate() + 90);
      const endDate = `${ninetyDaysOut.getFullYear()}-${String(ninetyDaysOut.getMonth() + 1).padStart(2, '0')}-${String(ninetyDaysOut.getDate()).padStart(2, '0')}`;

      const res = await fetch(
        `/api/community/${communitySlug}/teacher-availability?startDate=${startDate}&endDate=${endDate}`,
      );
      if (!res.ok) return;
      const slots: Array<{
        id: string;
        availability_date: string;
        start_time: string;
        end_time: string;
      }> = await res.json();

      const grouped = new Map<string, TimeSlot[]>();
      for (const s of slots) {
        const arr = grouped.get(s.availability_date) ?? [];
        arr.push({
          id: s.id,
          start_time: s.start_time.slice(0, 5),
          end_time: s.end_time.slice(0, 5),
        });
        grouped.set(s.availability_date, arr);
      }
      const days: DayAvailability[] = Array.from(grouped.entries()).map(
        ([date, slots]) => ({
          date,
          slots: slots.sort((a, b) => a.start_time.localeCompare(b.start_time)),
        }),
      );
      setAvailability(days);
    } catch (e) {
      console.error('Failed to load availability', e);
    } finally {
      setIsLoading(false);
    }
  }, [communitySlug]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  const slotsForSelected: TimeSlot[] = selectedDate
    ? availability.find(a => a.date === selectedDate)?.slots ?? []
    : [];

  const handleAdd = async (slot: { start_time: string; end_time: string }) => {
    if (!selectedDate) return;
    setIsBusy(true);
    try {
      const res = await fetch(
        `/api/community/${communitySlug}/teacher-availability`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: selectedDate, ...slot }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? 'Failed to add slot');
        return;
      }
      toast.success('Slot added');
      await fetchAvailability();
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async (slotId: string) => {
    setIsBusy(true);
    try {
      const res = await fetch(
        `/api/community/${communitySlug}/teacher-availability?slotId=${slotId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        toast.error('Failed to delete slot');
        return;
      }
      toast.success('Slot removed');
      await fetchAvailability();
    } finally {
      setIsBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <TeacherCalendarAvailability
        communitySlug={communitySlug}
        availability={availability}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />
      <AvailabilityDayPanel
        selectedDate={selectedDate}
        slots={slotsForSelected}
        onAdd={handleAdd}
        onDelete={handleDelete}
        isBusy={isBusy}
      />
    </div>
  );
}
