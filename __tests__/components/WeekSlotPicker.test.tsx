import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WeekSlotPicker } from '@/components/WeekSlotPicker';
import type { TeacherAvailabilitySlot } from '@/types/private-lessons';

const mkSlot = (date: string, start: string): TeacherAvailabilitySlot => ({
  id: `${date}-${start}`,
  teacher_id: 't',
  community_id: 'c',
  availability_date: date,
  start_time: start,
  end_time: start.replace(/^(\d{2}):(\d{2})$/, (_, h) => `${String(Number(h) + 1).padStart(2, '0')}:00`),
  is_active: true,
  created_at: '',
  updated_at: '',
  teacher_timezone: 'UTC',
});

// Freeze "today" to make tests deterministic.
const TODAY = new Date('2026-05-18T10:00:00');
beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(TODAY);
});
afterAll(() => {
  jest.useRealTimers();
});

// userEvent uses setTimeout internally; with fake timers we must advance them.
const user = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

test('renders the loading skeleton when loading=true', () => {
  render(<WeekSlotPicker loading slots={[]} selectedSlotId={null} onSelect={() => {}} />);
  expect(screen.getByTestId('week-slot-picker-skeleton')).toBeInTheDocument();
});

test('renders the empty state when no slots exist within the horizon', () => {
  render(<WeekSlotPicker slots={[]} selectedSlotId={null} onSelect={() => {}} />);
  expect(screen.getByText(/no availability in the next 30 days/i)).toBeInTheDocument();
});

test('lands on today + 6 days when there is a slot in that window', () => {
  const slots = [mkSlot('2026-05-19', '09:00'), mkSlot('2026-05-21', '14:00')];
  render(<WeekSlotPicker slots={slots} selectedSlotId={null} onSelect={() => {}} />);
  expect(screen.getByText(/May 18\s*–\s*24/i)).toBeInTheDocument();
});

test('auto-selects the first day with slots on mount', () => {
  const slots = [mkSlot('2026-05-20', '09:00'), mkSlot('2026-05-20', '11:00')];
  render(<WeekSlotPicker slots={slots} selectedSlotId={null} onSelect={() => {}} />);
  expect(screen.getByRole('button', { name: '9:00 AM' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '11:00 AM' })).toBeInTheDocument();
});

test('smart-jumps to the first week with slots when the current week is empty', () => {
  const slots = [mkSlot('2026-05-28', '09:00')];
  render(<WeekSlotPicker slots={slots} selectedSlotId={null} onSelect={() => {}} />);
  expect(screen.getByText(/May 25\s*–\s*31/i)).toBeInTheDocument();
});

test('greys out and blocks clicks on days with no slots', async () => {
  const slots = [mkSlot('2026-05-20', '09:00')];
  const onSelect = jest.fn();
  render(<WeekSlotPicker slots={slots} selectedSlotId={null} onSelect={onSelect} />);

  const monChip = screen.getByRole('button', { name: /MON 18/i });
  expect(monChip).toBeDisabled();

  await user().click(monChip);
  expect(onSelect).not.toHaveBeenCalled();
});

test('clicking a day with slots shows that day’s chips', async () => {
  const slots = [
    mkSlot('2026-05-19', '09:00'),
    mkSlot('2026-05-21', '14:00'),
    mkSlot('2026-05-21', '15:00'),
  ];
  render(<WeekSlotPicker slots={slots} selectedSlotId={null} onSelect={() => {}} />);

  await user().click(screen.getByRole('button', { name: /THU 21/i }));
  expect(screen.getByRole('button', { name: '2:00 PM' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '3:00 PM' })).toBeInTheDocument();
});

test('clicking a time chip calls onSelect with that slot', async () => {
  const slots = [mkSlot('2026-05-19', '09:00')];
  const onSelect = jest.fn();
  render(<WeekSlotPicker slots={slots} selectedSlotId={null} onSelect={onSelect} />);

  await user().click(screen.getByRole('button', { name: '9:00 AM' }));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '2026-05-19-09:00' }));
});

test('Prev is disabled in the landing week (today is the earliest)', () => {
  const slots = [mkSlot('2026-05-19', '09:00')];
  render(<WeekSlotPicker slots={slots} selectedSlotId={null} onSelect={() => {}} />);
  expect(screen.getByRole('button', { name: /previous week/i })).toBeDisabled();
});

test('Next navigates forward and auto-selects the new week’s first available day', async () => {
  const slots = [mkSlot('2026-05-19', '09:00'), mkSlot('2026-05-27', '14:00')];
  render(<WeekSlotPicker slots={slots} selectedSlotId={null} onSelect={() => {}} />);

  await user().click(screen.getByRole('button', { name: /next week/i }));
  expect(screen.getByText(/May 25\s*–\s*31/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '2:00 PM' })).toBeInTheDocument();
});

test('shows a "no slots this week" message when nav lands on an empty week', async () => {
  const slots = [mkSlot('2026-05-19', '09:00'), mkSlot('2026-06-02', '09:00')];
  render(<WeekSlotPicker slots={slots} selectedSlotId={null} onSelect={() => {}} />);

  await user().click(screen.getByRole('button', { name: /next week/i }));
  expect(screen.getByText(/no slots this week/i)).toBeInTheDocument();
});

test('Next is disabled at the 30-day horizon', async () => {
  const slots = [mkSlot('2026-05-19', '09:00'), mkSlot('2026-06-15', '09:00')];
  render(<WeekSlotPicker slots={slots} selectedSlotId={null} onSelect={() => {}} />);

  const u = user();
  for (let i = 0; i < 4; i++) {
    await u.click(screen.getByRole('button', { name: /next week/i }));
  }
  expect(screen.getByRole('button', { name: /next week/i })).toBeDisabled();
});
