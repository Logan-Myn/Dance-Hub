import type { CaptureResult, PostHog } from "posthog-js";

// Product analytics in the browser: PostHog, EU region. Cookieless by
// configuration, which is why the site needs no consent banner: persistence is
// memory only, so nothing is written to cookies or local storage. A visitor is
// a new anonymous person on each full page load; a signed-in user is named by
// their account id (identifyUser), so their events join the server's.
//
// Only page views and the events below are sent: no autocapture, no session
// replay. Nothing is sent, and the library isn't even downloaded, without
// NEXT_PUBLIC_POSTHOG_KEY or away from dance-hub.io (dev, preprod, local runs
// of a build that carries the prod env).
//
// The funnel steps the server can see (signup, community created, member
// joined...) are captured server side, in lib/analytics-server.ts.

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const SITE_HOST = "dance-hub.io";

export type ClientEvent = "about_page_viewed" | "join_clicked";

/**
 * A URL without its query string and fragment, campaign tags (utm_*) kept.
 * Links into the app carry secrets: password-reset and email-verification
 * tokens, payment redirect secrets. None of that may reach analytics.
 */
export function cleanUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const kept = new URLSearchParams();
    parsed.searchParams.forEach((value, key) => {
      if (key.startsWith("utm_")) kept.append(key, value);
    });
    parsed.search = kept.toString();
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.split(/[?#]/)[0];
  }
}

/** Cleans every URL PostHog attaches (current, referrer, initial and session entry URLs...). */
export function scrubUrls(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event;
  for (const bag of [event.properties, event.$set, event.$set_once]) {
    if (!bag) continue;
    for (const [key, value] of Object.entries(bag)) {
      if (typeof value === "string" && /^https?:\/\//i.test(value)) bag[key] = cleanUrl(value);
    }
  }
  return event;
}

let loading: Promise<PostHog | null> | undefined;

/** The library, loaded on first use after hydration rather than with the page. */
function client(): Promise<PostHog | null> {
  if (loading) return loading;
  if (!KEY || typeof window === "undefined" || window.location.hostname !== SITE_HOST) {
    loading = Promise.resolve(null);
    return loading;
  }
  loading = import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(KEY, {
        // In the CSP's connect-src (next.config.js).
        api_host: "https://eu.i.posthog.com",
        ui_host: "https://eu.posthog.com",
        persistence: "memory",
        // Client-side navigations count as page views too.
        capture_pageview: "history_change",
        capture_pageleave: true,
        autocapture: false,
        capture_dead_clicks: false,
        capture_heatmaps: false,
        rageclick: false,
        disable_session_recording: true,
        disable_surveys: true,
        // No script from PostHog's servers, nor its remote config and flags.
        disable_external_dependency_loading: true,
        advanced_disable_flags: true,
        // Anonymous visitors stay events only; a person exists once identified.
        person_profiles: "identified_only",
        before_send: scrubUrls,
      });
      return posthog;
    })
    .catch((error) => {
      console.error("[analytics] PostHog failed to load:", error);
      return null;
    });
  return loading;
}

/** Calls run in order, after the library has loaded, and never throw into the caller. */
function withClient(fn: (posthog: PostHog) => void): void {
  void client()
    .then((posthog) => {
      if (posthog) fn(posthog);
    })
    .catch(() => {});
}

/** Called once, from instrumentation-client.ts. */
export function initAnalytics(): void {
  withClient(() => {});
}

export function track(event: ClientEvent, properties?: Record<string, unknown>): void {
  withClient((posthog) => posthog.capture(event, properties));
}

export function identifyUser(userId: string): void {
  withClient((posthog) => posthog.identify(userId));
}

/** On sign-out, so the next user on this page load starts anonymous. */
export function resetUser(): void {
  withClient((posthog) => posthog.reset());
}
