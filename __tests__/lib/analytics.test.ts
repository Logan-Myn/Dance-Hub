import type { CaptureResult } from "posthog-js";
import { cleanUrl, scrubUrls } from "@/lib/analytics";

describe("analytics URL scrubbing", () => {
  it("drops secrets from links into the app", () => {
    expect(cleanUrl("https://dance-hub.io/auth/reset-password?token=abc123")).toBe("https://dance-hub.io/auth/reset-password");
    expect(cleanUrl("https://dance-hub.io/auth/verify-email?token=abc&callbackURL=%2F#top")).toBe("https://dance-hub.io/auth/verify-email");
    expect(
      cleanUrl("https://dance-hub.io/salsa?payment_intent=pi_1&payment_intent_client_secret=pi_1_secret_x&redirect_status=succeeded")
    ).toBe("https://dance-hub.io/salsa");
  });

  it("keeps campaign tags", () => {
    expect(cleanUrl("https://dance-hub.io/?utm_source=instagram&ref=x&utm_campaign=launch")).toBe(
      "https://dance-hub.io/?utm_source=instagram&utm_campaign=launch"
    );
  });

  it("leaves non-URLs alone", () => {
    expect(cleanUrl("$direct")).toBe("$direct");
  });

  it("cleans every URL on an event, including person properties", () => {
    const event = {
      uuid: "u",
      event: "$pageview",
      properties: {
        $current_url: "https://dance-hub.io/auth/reset-password?token=abc",
        $referrer: "https://mail.google.com/mail/u/0/?tab=rm#inbox",
        $session_entry_url: "https://dance-hub.io/auth/verify-signup?token=def",
        $pathname: "/auth/reset-password",
        community: "salsa",
      },
      $set_once: { $initial_current_url: "https://dance-hub.io/auth/reset-password?token=abc" },
    } as unknown as CaptureResult;

    const out = scrubUrls(event)!;
    expect(out.properties.$current_url).toBe("https://dance-hub.io/auth/reset-password");
    expect(out.properties.$referrer).toBe("https://mail.google.com/mail/u/0/");
    expect(out.properties.$session_entry_url).toBe("https://dance-hub.io/auth/verify-signup");
    expect(out.properties.$pathname).toBe("/auth/reset-password");
    expect(out.properties.community).toBe("salsa");
    expect(out.$set_once!.$initial_current_url).toBe("https://dance-hub.io/auth/reset-password");
    expect(JSON.stringify(out)).not.toMatch(/token|secret/);
  });
});
