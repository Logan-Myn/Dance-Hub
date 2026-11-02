import { PostHog } from "posthog-node";

// Product analytics from the server: the funnel steps only the server sees for
// sure (an ad blocker can't hide them), keyed by the user's account id, the
// same id the browser identifies with (lib/analytics.ts).
//
// Nothing is sent without NEXT_PUBLIC_POSTHOG_KEY, nor from anything but the
// production server for dance-hub.io: a dev server or a local run with the
// prod env file must not put test signups in the real numbers.
// Capturing never throws and never delays the response: events are sent in
// the background.

export type ServerEvent =
  | "user_signed_up"
  | "community_created"
  | "payments_connected"
  | "course_created"
  | "live_class_scheduled"
  | "member_joined";

let client: PostHog | null | undefined;

function getClient(): PostHog | null {
  if (client === undefined) {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const live = process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_APP_URL === "https://dance-hub.io";
    // A handful of events a day: each is sent right away rather than batched.
    // One that fails to send waits for the next event, and a restart drops it.
    client = key && live ? new PostHog(key, { host: "https://eu.i.posthog.com", flushAt: 1, flushInterval: 0 }) : null;
  }
  return client;
}

export function trackServer(userId: string, event: ServerEvent, properties?: Record<string, unknown>): void {
  try {
    // The request's IP is the server's, so no GeoIP: the browser's events
    // carry the visitor's country.
    getClient()?.capture({ distinctId: userId, event, properties, disableGeoip: true });
  } catch (error) {
    console.error(`[analytics] ${event} not captured:`, error);
  }
}
