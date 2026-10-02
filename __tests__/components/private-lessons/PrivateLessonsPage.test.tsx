import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import PrivateLessonsPage from '@/components/PrivateLessonsPage';

jest.mock('react-hot-toast', () => {
  const toast = { success: jest.fn(), error: jest.fn() };
  return { __esModule: true, default: toast, toast };
});
// Only the page's own behaviour is under test here.
jest.mock('@/components/LessonBookingModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/CreatePrivateLessonModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/private-lessons/manage/PrivateLessonManagementModal', () => ({
  __esModule: true,
  default: () => null,
}));

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

test('a lesson payment that comes back from a redirect is reported as processing, not failed', async () => {
  window.history.replaceState(
    null,
    '',
    '/salsa/private-lessons?lesson_payment=return&payment_intent=pi_1&redirect_status=processing',
  );

  render(
    <PrivateLessonsPage communitySlug="salsa" communityId="c1" isCreator={false} isMember initialLessons={[]} />,
  );

  await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/processing/i)));
  expect(toast.error).not.toHaveBeenCalled();
});
