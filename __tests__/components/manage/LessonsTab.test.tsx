import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LessonsTab } from '@/components/private-lessons/manage/LessonsTab';

jest.mock('@/components/CreatePrivateLessonModal', () => ({ __esModule: true, default: () => null }));

const lesson = {
  id: 'lesson-1',
  title: 'Beginner Bachata',
  regular_price: 50,
  duration_minutes: 60,
  location_type: 'online',
  is_active: true,
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ lessons: [lesson] }) }) as jest.Mock;
});

test('the delete dialog says what really happens: hidden from students, bookings kept', async () => {
  const user = userEvent.setup();
  render(<LessonsTab communityId="c1" communitySlug="salsa" />);

  await user.click(await screen.findByRole('button', { name: /more actions/i }));
  await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

  const dialog = await screen.findByRole('alertdialog');
  expect(dialog).toHaveTextContent(/no longer see or book Beginner Bachata/i);
  expect(dialog).toHaveTextContent(/past bookings stay intact/i);
  expect(dialog).not.toHaveTextContent(/permanently/i);
});
