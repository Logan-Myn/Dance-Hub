"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Clock, X, Plus } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export interface AvailabilitySlotView {
  id?: string;
  start_time: string; // "HH:MM"
  end_time: string;
}

interface AvailabilityDayPanelProps {
  selectedDate: string | null; // "YYYY-MM-DD"
  slots: AvailabilitySlotView[];
  onAdd: (slot: { start_time: string; end_time: string }) => void;
  onDelete: (slotId: string) => void;
  isBusy?: boolean;
}

function overlaps(
  a: { start_time: string; end_time: string },
  b: { start_time: string; end_time: string },
): boolean {
  return (
    (a.start_time >= b.start_time && a.start_time < b.end_time) ||
    (a.end_time > b.start_time && a.end_time <= b.end_time) ||
    (a.start_time <= b.start_time && a.end_time >= b.end_time)
  );
}

export function AvailabilityDayPanel({
  selectedDate,
  slots,
  onAdd,
  onDelete,
  isBusy,
}: AvailabilityDayPanelProps) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!selectedDate) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground h-full flex items-center justify-center">
        Select a day on the calendar to add or edit availability.
      </div>
    );
  }

  const handleAdd = () => {
    setError(null);
    if (!start || !end) {
      setError('Please enter both times.');
      return;
    }
    if (end <= start) {
      setError('End time must be after start time.');
      return;
    }
    const candidate = { start_time: start, end_time: end };
    if (slots.some(s => overlaps(candidate, s))) {
      setError('Overlaps an existing slot.');
      return;
    }
    onAdd(candidate);
    setStart('');
    setEnd('');
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <h3 className="font-display text-base font-semibold mb-3">
        {format(parseISO(selectedDate), 'EEE, MMM d')}
      </h3>

      <div className="space-y-2 mb-4">
        {slots.length === 0 ? (
          <div className="text-sm text-muted-foreground italic py-2">
            No availability set for this day.
          </div>
        ) : (
          slots.map(slot => (
            <div
              key={slot.id ?? `${slot.start_time}-${slot.end_time}`}
              className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  {slot.start_time} – {slot.end_time}
                </span>
              </div>
              {slot.id && (
                <button
                  type="button"
                  aria-label={`Delete slot ${slot.start_time}`}
                  onClick={() => onDelete(slot.id!)}
                  className="text-muted-foreground hover:text-destructive p-1 rounded"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border/50 pt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="add-from" className="text-xs">From</Label>
            <Input
              id="add-from"
              type="time"
              value={start}
              onChange={e => setStart(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="add-to" className="text-xs">To</Label>
            <Input
              id="add-to"
              type="time"
              value={end}
              onChange={e => setEnd(e.target.value)}
            />
          </div>
        </div>
        {error && (
          <div className="text-xs text-destructive">{error}</div>
        )}
        <Button
          type="button"
          onClick={handleAdd}
          disabled={isBusy}
          className="w-full rounded-xl"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add slot
        </Button>
      </div>
    </div>
  );
}
