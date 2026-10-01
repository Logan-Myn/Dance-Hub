/**
 * Stripe event dedupe. A redelivered event that was already handled is
 * skipped; one still being handled is refused (so Stripe retries later);
 * a failed attempt releases its claim so the retry runs it again.
 *
 * @jest-environment node
 */
import { claimWebhookEvent, finishWebhookEvent } from '@/lib/stripe-webhook-events';

const mockSql = jest.fn();
jest.mock('@/lib/db', () => ({ sql: (...a: unknown[]) => mockSql(...a) }));

const text = (call: unknown[]) => (call[0] as string[]).join('?');
const event = { id: 'evt_1', type: 'invoice.payment_succeeded', account: 'acct_1' };

beforeEach(() => mockSql.mockReset());

describe('claimWebhookEvent', () => {
  it('claims a new event', async () => {
    mockSql.mockResolvedValueOnce([{ event_id: 'evt_1' }]);

    await expect(claimWebhookEvent(event)).resolves.toBe('claimed');

    const call = mockSql.mock.calls[0];
    expect(text(call)).toMatch(/INSERT INTO stripe_webhook_events/);
    // A stale claim from a crashed attempt can be taken over; a processed one can't.
    expect(text(call)).toMatch(/ON CONFLICT \(event_id\) DO UPDATE/);
    expect(text(call)).toMatch(/status = 'processing'/);
    expect(call.slice(1)).toEqual(expect.arrayContaining(['evt_1', 'invoice.payment_succeeded', 'acct_1']));
  });

  it('reports an event that was already processed as a duplicate', async () => {
    mockSql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ status: 'processed' }]);
    await expect(claimWebhookEvent(event)).resolves.toBe('duplicate');
  });

  it('reports an event another attempt is still processing as in progress', async () => {
    mockSql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ status: 'processing' }]);
    await expect(claimWebhookEvent(event)).resolves.toBe('in_progress');
  });

  it('processes the event anyway when the dedupe table is unavailable', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSql.mockRejectedValueOnce(new Error('relation "stripe_webhook_events" does not exist'));
    await expect(claimWebhookEvent(event)).resolves.toBe('claimed');
  });
});

describe('finishWebhookEvent', () => {
  it('marks a successful event as processed', async () => {
    mockSql.mockResolvedValueOnce([]);
    await finishWebhookEvent('evt_1', true);
    expect(text(mockSql.mock.calls[0])).toMatch(/UPDATE stripe_webhook_events\s+SET status = 'processed'/);
  });

  it('releases the claim of a failed event so the retry runs it', async () => {
    mockSql.mockResolvedValueOnce([]);
    await finishWebhookEvent('evt_1', false);
    expect(text(mockSql.mock.calls[0])).toMatch(/DELETE FROM stripe_webhook_events/);
    expect(mockSql.mock.calls[0].slice(1)).toContain('evt_1');
  });

  it('never throws', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSql.mockRejectedValueOnce(new Error('db down'));
    await expect(finishWebhookEvent('evt_1', true)).resolves.toBeUndefined();
  });
});
