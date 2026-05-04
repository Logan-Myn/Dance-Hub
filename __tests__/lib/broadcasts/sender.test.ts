const mockBatchSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    batch: { send: (...args: unknown[]) => mockBatchSend(...args) },
  })),
}));

// Avoid pulling in the React Email browser bundle (uses TextDecoder, not in jsdom).
// runBroadcast's behaviour we care about here is chunking + retry, not template rendering.
jest.mock('@react-email/components', () => ({
  render: jest.fn(async (_el: unknown) => '<html><body>FAKE_TEMPLATE</body></html>'),
}));
jest.mock('@/lib/resend/templates/marketing/broadcast', () => ({
  BroadcastEmail: () => null,
}));

import { runBroadcast } from '@/lib/broadcasts/sender';

const recipient = (i: number) => ({
  userId: `u${i}`,
  email: `user${i}@example.com`,
  displayName: `User ${i}`,
  unsubscribeToken: `tok${i}`,
});

describe('runBroadcast', () => {
  beforeEach(() => {
    mockBatchSend.mockReset();
  });

  it('sends a single batch when recipients <= BATCH_SIZE', async () => {
    mockBatchSend.mockResolvedValueOnce({ data: { data: [{ id: 'batch-1' }] }, error: null });

    const result = await runBroadcast({
      broadcastId: 'b1',
      communityId: 'test-community-id',
      subject: 'Hello',
      htmlContent: '<p>hi</p>',
      previewText: 'preview',
      recipients: [recipient(1), recipient(2)],
      fromName: 'My Community',
      replyTo: 'owner@example.com',
    });

    expect(mockBatchSend).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('sent');
    expect(result.resendBatchIds).toEqual(['batch-1']);
    expect(result.successfulCount).toBe(2);
    expect(result.failedCount).toBe(0);
  });

  it('chunks into multiple batches of 100', async () => {
    mockBatchSend.mockResolvedValue({ data: { data: [{ id: 'batch' }] }, error: null });
    const recipients = Array.from({ length: 250 }, (_, i) => recipient(i));

    const result = await runBroadcast({
      broadcastId: 'b1',
      communityId: 'test-community-id',
      subject: 'Hello',
      htmlContent: '<p>hi</p>',
      recipients,
      fromName: 'X',
      replyTo: 'x@example.com',
    });

    expect(mockBatchSend).toHaveBeenCalledTimes(3); // 100 + 100 + 50
    expect(result.status).toBe('sent');
    expect(result.successfulCount).toBe(250);
  });

  it('returns partial_failure when some batches fail after retries', async () => {
    // First batch (100) succeeds. Second batch (50) fails all 3 retries.
    mockBatchSend
      .mockResolvedValueOnce({ data: { data: [{ id: 'batch-1' }] }, error: null })
      .mockRejectedValue(new Error('boom'));

    const recipients = Array.from({ length: 150 }, (_, i) => recipient(i));

    const result = await runBroadcast({
      broadcastId: 'b1',
      communityId: 'test-community-id',
      subject: 'Hello',
      htmlContent: '<p>hi</p>',
      recipients,
      fromName: 'X',
      replyTo: 'x@example.com',
    });

    expect(result.status).toBe('partial_failure');
    expect(result.errorMessage).toContain('boom');
    expect(result.successfulCount).toBe(100);
    expect(result.failedCount).toBe(50);
  }, 15000); // allow extra time for retry backoff

  it('returns failed when all batches fail', async () => {
    mockBatchSend.mockRejectedValue(new Error('boom'));
    const result = await runBroadcast({
      broadcastId: 'b1',
      communityId: 'test-community-id',
      subject: 'X',
      htmlContent: '<p>x</p>',
      recipients: [recipient(1)],
      fromName: 'X',
      replyTo: 'x@example.com',
    });
    expect(result.status).toBe('failed');
    expect(result.failedCount).toBe(1);
    expect(result.successfulCount).toBe(0);
  }, 15000);
});
