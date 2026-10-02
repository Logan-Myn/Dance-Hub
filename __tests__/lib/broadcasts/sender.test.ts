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

// Real batch spacing and backoff, scaled down so retries don't slow the suite.
jest.mock('@/lib/broadcasts/constants', () => ({
  ...jest.requireActual('@/lib/broadcasts/constants'),
  BATCH_DELAY_MS: 1,
  RETRY_BASE_DELAY_MS: 1,
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

describe('runBroadcast with Resend 6 results ({ data, error } instead of throwing)', () => {
  const run = (recipients = [recipient(1), recipient(2)], fromName = 'My Community') =>
    runBroadcast({
      broadcastId: 'b1',
      communityId: 'c1',
      subject: 'Hello',
      htmlContent: '<p>hi</p>',
      recipients,
      fromName,
      replyTo: 'hello@dance-hub.io',
    });
  const ok = { data: { data: [{ id: 'email-1' }] }, error: null, headers: null };
  const fail = (statusCode: number | null, name: string, message: string) => ({
    data: null,
    error: { statusCode, name, message },
    headers: null,
  });

  beforeEach(() => {
    mockBatchSend.mockReset();
  });

  it('treats a returned error as a failure, records who missed out, and does not report success', async () => {
    mockBatchSend.mockResolvedValue(fail(422, 'validation_error', 'Invalid `from` field'));

    const result = await run();

    expect(result.status).toBe('failed');
    expect(result.successfulCount).toBe(0);
    expect(result.failedCount).toBe(2);
    expect(result.errorMessage).toContain('Invalid `from` field');
    expect(result.failedRecipients).toEqual([
      { userId: 'u1', email: 'user1@example.com', error: 'Invalid `from` field' },
      { userId: 'u2', email: 'user2@example.com', error: 'Invalid `from` field' },
    ]);
    // A validation error won't fix itself: no retries.
    expect(mockBatchSend).toHaveBeenCalledTimes(1);
  });

  it('retries a rate-limited batch and succeeds', async () => {
    mockBatchSend
      .mockResolvedValueOnce(fail(429, 'rate_limit_exceeded', 'Too many requests'))
      .mockResolvedValueOnce(ok);

    const result = await run();

    expect(mockBatchSend).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('sent');
    expect(result.failedRecipients).toEqual([]);
  }, 15000);

  it('retries server errors, then gives up and records the batch as failed', async () => {
    mockBatchSend.mockResolvedValue(fail(500, 'internal_server_error', 'Oops'));

    const result = await run();

    expect(mockBatchSend).toHaveBeenCalledTimes(3);
    expect(result.status).toBe('failed');
    expect(result.failedRecipients).toHaveLength(2);
  }, 15000);

  it('retries while an earlier attempt with the same key is still being processed', async () => {
    mockBatchSend
      .mockResolvedValueOnce(fail(409, 'concurrent_idempotent_requests', 'Same key in flight'))
      .mockResolvedValueOnce(ok);

    const result = await run();

    expect(mockBatchSend).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('sent');
  });

  it('does not retry a reused key with a different payload', async () => {
    mockBatchSend.mockResolvedValue(fail(409, 'invalid_idempotent_request', 'Key reused'));

    const result = await run();

    expect(mockBatchSend).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('failed');
  });

  it('sends each batch with its own idempotency key, so a retry cannot send twice', async () => {
    mockBatchSend
      .mockResolvedValueOnce(fail(503, 'application_error', 'Unavailable'))
      .mockResolvedValue(ok);
    const recipients = Array.from({ length: 150 }, (_, i) => recipient(i));

    await run(recipients);

    const keys = mockBatchSend.mock.calls.map((c) => (c[1] as { idempotencyKey?: string })?.idempotencyKey);
    expect(keys).toEqual(['broadcast-b1-0', 'broadcast-b1-0', 'broadcast-b1-1']);
  }, 15000);

  it('quotes the community name in the From header', async () => {
    mockBatchSend.mockResolvedValue(ok);

    await run([recipient(1)], 'Salsa, "La Rumba"\r\nBcc: x@evil.test');

    const [emails] = mockBatchSend.mock.calls[0];
    expect(emails[0].from).toBe(`"Salsa, 'La Rumba' Bcc: x@evil.test" <community@dance-hub.io>`);
  });
});
