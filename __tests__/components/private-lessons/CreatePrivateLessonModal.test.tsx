import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreatePrivateLessonModal from '@/components/CreatePrivateLessonModal';

jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'teacher-1' } } }) }));
jest.mock('react-hot-toast', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
// Desktop layout: the dialog, not the mobile sheet.
jest.mock('@/hooks/use-is-mobile', () => ({ useIsMobile: () => false }));

const editingLesson = {
  id: 'lesson-1',
  title: 'Bachata',
  description: 'Basics',
  duration_minutes: 60,
  regular_price: 50,
  member_price: 40,
  location_type: 'online',
  is_active: true,
  max_bookings_per_month: null,
  requirements: '',
  cancellation_cutoff_hours: 24,
  late_refund_policy: 'no_refund',
};

beforeAll(() => {
  // jsdom has no ResizeObserver; the switch control measures itself with it.
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ lesson: {} }) }) as jest.Mock;
});

function renderEditor() {
  return render(
    <CreatePrivateLessonModal
      isOpen
      onClose={() => {}}
      communitySlug="salsa"
      onSuccess={() => {}}
      editingLesson={editingLesson}
    />,
  );
}

test('labels prices in euros, the currency lessons are charged in', () => {
  renderEditor();
  expect(screen.getByLabelText(/^Price \(€\)/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Member price \(€\)/)).toBeInTheDocument();
  expect(screen.queryByText(/\(\$\)/)).not.toBeInTheDocument();
});

test('clearing the member price sends member_price: null so the discount is removed', async () => {
  const user = userEvent.setup();
  renderEditor();

  await user.clear(screen.getByLabelText(/Member price/));
  await user.click(screen.getByRole('button', { name: /Update Private Lesson/ }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe('/api/community/salsa/private-lessons/lesson-1');
  expect(init.method).toBe('PUT');
  expect(JSON.parse(init.body)).toEqual(expect.objectContaining({ member_price: null }));
});

describe('price checks before saving', () => {
  async function submitWith(regular: string, member: string) {
    const user = userEvent.setup();
    renderEditor();
    const regularInput = screen.getByLabelText(/^Price \(€\)/);
    const memberInput = screen.getByLabelText(/Member price/);
    await user.clear(regularInput);
    await user.type(regularInput, regular);
    await user.clear(memberInput);
    if (member) await user.type(memberInput, member);
    await user.click(screen.getByRole('button', { name: /Update Private Lesson/ }));
  }

  test('allows a member price equal to the regular price, as the server does', async () => {
    await submitWith('50', '50');
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  test('allows a member price of 0 (no discount)', async () => {
    await submitWith('50', '0');
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  test('refuses a regular price under 0.50', async () => {
    await submitWith('0.3', '');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('refuses a member price between 0 and 0.50', async () => {
    await submitWith('50', '0.3');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
