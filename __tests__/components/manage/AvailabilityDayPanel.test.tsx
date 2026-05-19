import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AvailabilityDayPanel } from '@/components/private-lessons/manage/AvailabilityDayPanel';

test('renders the placeholder when no date is selected', () => {
  render(
    <AvailabilityDayPanel
      selectedDate={null}
      slots={[]}
      onAdd={() => {}}
      onDelete={() => {}}
    />,
  );
  expect(screen.getByText(/select a day on the calendar/i)).toBeInTheDocument();
});

test('renders the empty state when day has no slots', () => {
  render(
    <AvailabilityDayPanel
      selectedDate="2026-05-21"
      slots={[]}
      onAdd={() => {}}
      onDelete={() => {}}
    />,
  );
  expect(screen.getByText(/no availability set for this day/i)).toBeInTheDocument();
});

test('renders existing slots and triggers onDelete', async () => {
  const user = userEvent.setup();
  const onDelete = jest.fn();
  render(
    <AvailabilityDayPanel
      selectedDate="2026-05-21"
      slots={[{ id: 's1', start_time: '09:00', end_time: '10:30' }]}
      onAdd={() => {}}
      onDelete={onDelete}
    />,
  );
  expect(screen.getByText(/09:00/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /delete slot 09:00/i }));
  expect(onDelete).toHaveBeenCalledWith('s1');
});

test('rejects an add where end is not after start', async () => {
  const user = userEvent.setup();
  const onAdd = jest.fn();
  render(
    <AvailabilityDayPanel
      selectedDate="2026-05-21"
      slots={[]}
      onAdd={onAdd}
      onDelete={() => {}}
    />,
  );
  await user.type(screen.getByLabelText(/from/i), '10:00');
  await user.type(screen.getByLabelText(/to/i), '09:00');
  await user.click(screen.getByRole('button', { name: /add/i }));
  expect(onAdd).not.toHaveBeenCalled();
  expect(screen.getByText(/end time must be after start time/i)).toBeInTheDocument();
});

test('rejects an add that overlaps an existing slot', async () => {
  const user = userEvent.setup();
  const onAdd = jest.fn();
  render(
    <AvailabilityDayPanel
      selectedDate="2026-05-21"
      slots={[{ id: 's1', start_time: '09:00', end_time: '10:30' }]}
      onAdd={onAdd}
      onDelete={() => {}}
    />,
  );
  await user.type(screen.getByLabelText(/from/i), '10:00');
  await user.type(screen.getByLabelText(/to/i), '11:00');
  await user.click(screen.getByRole('button', { name: /add/i }));
  expect(onAdd).not.toHaveBeenCalled();
  expect(screen.getByText(/overlaps an existing slot/i)).toBeInTheDocument();
});

test('valid add calls onAdd and clears inputs', async () => {
  const user = userEvent.setup();
  const onAdd = jest.fn();
  render(
    <AvailabilityDayPanel
      selectedDate="2026-05-21"
      slots={[]}
      onAdd={onAdd}
      onDelete={() => {}}
    />,
  );
  await user.type(screen.getByLabelText(/from/i), '14:00');
  await user.type(screen.getByLabelText(/to/i), '15:30');
  await user.click(screen.getByRole('button', { name: /add/i }));
  expect(onAdd).toHaveBeenCalledWith({ start_time: '14:00', end_time: '15:30' });
});
