import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LessonCard } from '@/components/private-lessons/manage/LessonCard';
import type { PrivateLesson } from '@/types/private-lessons';

const mkLesson = (over: Partial<PrivateLesson> = {}): PrivateLesson => ({
  id: 'l1',
  community_id: 'c1',
  teacher_id: 't1',
  title: 'Beginner Bachata',
  description: 'd',
  duration_minutes: 60,
  regular_price: 40,
  member_price: null,
  location_type: 'online',
  location_details: null,
  requirements: null,
  is_active: true,
  cancellation_cutoff_hours: 24,
  late_refund_policy: 'no_refund',
  created_at: '',
  updated_at: '',
  ...over,
} as unknown as PrivateLesson);

test('renders title, price, and duration/location subline', () => {
  render(
    <LessonCard
      lesson={mkLesson()}
      onEdit={() => {}}
      onToggleActive={() => {}}
      onDelete={() => {}}
    />,
  );
  expect(screen.getByText('Beginner Bachata')).toBeInTheDocument();
  expect(screen.getByText(/€40/)).toBeInTheDocument();
  expect(screen.getByText(/60 min/)).toBeInTheDocument();
  expect(screen.getByText(/Online/i)).toBeInTheDocument();
  expect(screen.getByText(/Active/i)).toBeInTheDocument();
});

test('renders Inactive badge for inactive lessons', () => {
  render(
    <LessonCard
      lesson={mkLesson({ is_active: false })}
      onEdit={() => {}}
      onToggleActive={() => {}}
      onDelete={() => {}}
    />,
  );
  expect(screen.getByText(/Inactive/i)).toBeInTheDocument();
});

test('clicking the card body calls onEdit', async () => {
  const onEdit = jest.fn();
  render(
    <LessonCard
      lesson={mkLesson()}
      onEdit={onEdit}
      onToggleActive={() => {}}
      onDelete={() => {}}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: /edit lesson/i }));
  expect(onEdit).toHaveBeenCalledTimes(1);
});

test('⋯ menu fires onDelete', async () => {
  const onDelete = jest.fn();
  render(
    <LessonCard
      lesson={mkLesson()}
      onEdit={() => {}}
      onToggleActive={() => {}}
      onDelete={onDelete}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: /more actions/i }));
  await userEvent.click(screen.getByRole('menuitem', { name: /delete/i }));
  expect(onDelete).toHaveBeenCalledTimes(1);
});
