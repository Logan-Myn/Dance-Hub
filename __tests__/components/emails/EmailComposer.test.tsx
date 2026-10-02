import React, { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-hot-toast';
import { EmailComposer } from '@/components/emails/EmailComposer';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('react-hot-toast', () => ({
  toast: Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
    loading: jest.fn(() => 'progress'),
    dismiss: jest.fn(),
  }),
}));
// The rich-text editor isn't under test: it just reports some content.
jest.mock('@/components/emails/EmailEditor', () => ({
  EmailEditor: ({ onChange }: { onChange: (h: string, j: unknown) => void }) => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => onChange('<p>Hello</p>', { type: 'doc' }), []);
    return null;
  },
}));
jest.mock('@/components/emails/QuotaBadge', () => ({ QuotaBadge: () => null }));
jest.mock('@/components/emails/UpgradeDialog', () => ({ UpgradeDialog: () => null }));

/**
 * Publishing answers "sending" right away; the status route then reports
 * each of `statuses` in turn (the last one repeats).
 */
function reply(...statuses: object[]) {
  let poll = 0;
  global.fetch = jest.fn(async (url: RequestInfo | URL) => {
    const body = String(url).endsWith('/status')
      ? statuses[Math.min(poll++, statuses.length - 1)]
      : { broadcastId: 'b1', recipientCount: 600, status: 'sending' };
    return { ok: true, status: 200, json: async () => body };
  }) as unknown as typeof fetch;
}
const statusPolls = () =>
  (global.fetch as jest.Mock).mock.calls.filter(([url]) => String(url).endsWith('/broadcasts/b1/status')).length;

async function publish() {
  render(
    <EmailComposer
      communityId="c1"
      communitySlug="salsa"
      communityName="Salsa"
      ownerEmail="o@example.com"
      activeMemberCount={600}
      quota={{ tier: 'paid', used: 1, limit: 200 }}
    />
  );
  await userEvent.type(screen.getByLabelText('Subject'), 'News');
  await userEvent.click(screen.getByRole('button', { name: 'Publish broadcast' }));
}

beforeEach(() => jest.clearAllMocks());

it('says so when nobody received the broadcast, and keeps the draft', async () => {
  reply({ status: 'failed', recipientCount: 600, failedCount: 600 });
  await publish();
  await waitFor(() => expect(toast.error).toHaveBeenCalled());
  expect((toast.error as jest.Mock).mock.calls[0][0]).toMatch(/couldn't be sent/);
  expect(toast.success).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
});

it('reports a partial delivery as a problem, with the numbers', async () => {
  reply({ status: 'partial_failure', recipientCount: 600, failedCount: 400 });
  await publish();
  await waitFor(() => expect(toast.error).toHaveBeenCalled());
  expect((toast.error as jest.Mock).mock.calls[0][0]).toBe(
    "Sent to 200 of 600 members. 400 didn't receive it."
  );
  expect(toast.success).not.toHaveBeenCalled();
});

it('confirms a full delivery', async () => {
  reply({ status: 'sent', recipientCount: 600, failedCount: 0 });
  await publish();
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Published to 600 readers.'));
  expect(mockPush).toHaveBeenCalledWith('/salsa/admin/emails/b1');
});

it('waits for a send still in progress, showing that it is sending', async () => {
  reply(
    { status: 'sending', recipientCount: 600, failedCount: null },
    { status: 'sent', recipientCount: 600, failedCount: 0 }
  );
  await publish();
  expect(toast.loading).toHaveBeenCalledWith('Sending to 600 members…');
  expect(screen.getByRole('button', { name: 'Publishing…' })).toBeDisabled();
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Published to 600 readers.'), { timeout: 5000 });
  expect(statusPolls()).toBe(2);
  expect(toast.dismiss).toHaveBeenCalledWith('progress');
}, 10000);

it('reports a partial delivery when the missed count is unknown', async () => {
  reply({ status: 'partial_failure', recipientCount: 600, failedCount: null });
  await publish();
  await waitFor(() => expect(toast.error).toHaveBeenCalled());
  expect((toast.error as jest.Mock).mock.calls[0][0]).toBe("Some of your 600 members didn't receive it.");
});
