import { sql } from '@/lib/db';

// Stripe delivers an event at least once: a retry after a timeout or a
// non-2xx can arrive after the first attempt already ran its side effects.
// stripe_webhook_events (migration 2026-10-01_membership_billing.sql) records
// each event id so a redelivery is skipped.
//
//   'claimed'     run the handler, then call finishWebhookEvent
//   'duplicate'   already processed: answer 200 and do nothing
//   'in_progress' another attempt is running it: answer non-2xx so Stripe
//                 retries later (if that attempt fails, the retry runs it)
export type WebhookEventClaim = 'claimed' | 'duplicate' | 'in_progress';

export async function claimWebhookEvent(event: {
  id: string;
  type: string;
  account?: string | null;
}): Promise<WebhookEventClaim> {
  try {
    // A claim older than 5 minutes belongs to an attempt that crashed before
    // it could release it, so a redelivery may take it over.
    const claimed = await sql<{ event_id: string }[]>`
      INSERT INTO stripe_webhook_events (event_id, event_type, account_id)
      VALUES (${event.id}, ${event.type}, ${event.account ?? null})
      ON CONFLICT (event_id) DO UPDATE
        SET claimed_at = NOW()
        WHERE stripe_webhook_events.status = 'processing'
          AND stripe_webhook_events.claimed_at < NOW() - INTERVAL '5 minutes'
      RETURNING event_id
    `;
    if (claimed.length > 0) return 'claimed';

    const [existing] = await sql<{ status: string }[]>`
      SELECT status FROM stripe_webhook_events WHERE event_id = ${event.id}
    `;
    return existing?.status === 'processed' ? 'duplicate' : 'in_progress';
  } catch (err) {
    // Without the table (migration not applied yet) or on a database error,
    // handle the event as before rather than drop it.
    console.error('[stripe-webhook] event dedupe unavailable, handling the event anyway:', err);
    return 'claimed';
  }
}

/**
 * Records the outcome of a claimed event. Success marks it processed; a
 * failure deletes the claim so Stripe's retry handles it again.
 */
export async function finishWebhookEvent(eventId: string, succeeded: boolean): Promise<void> {
  try {
    if (succeeded) {
      await sql`
        UPDATE stripe_webhook_events
        SET status = 'processed', processed_at = NOW()
        WHERE event_id = ${eventId}
      `;
    } else {
      await sql`
        DELETE FROM stripe_webhook_events
        WHERE event_id = ${eventId} AND status = 'processing'
      `;
    }
  } catch (err) {
    console.error('[stripe-webhook] could not record the event outcome:', eventId, err);
  }
}
