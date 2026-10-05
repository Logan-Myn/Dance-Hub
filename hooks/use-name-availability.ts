"use client";

import { useEffect, useRef, useState } from "react";
import { checkCommunitySlug } from "@/lib/community-slug";

export type NameAvailability =
  | { status: "idle"; message: null; slug: null }
  | { status: "invalid"; message: string; slug: null }
  | { status: "checking" | "available" | "unknown"; message: null; slug: string }
  | { status: "taken"; message: string; slug: string };

const MIN_LENGTH = 3;

/**
 * Whether a new community name is free, and the web address it gets. The
 * address uses the server's own slug rule. The server is asked once the owner
 * stops typing, and an answer for a name they've since changed is ignored.
 */
export function useNameAvailability(rawName: string, delayMs = 400): NameAvailability {
  const name = rawName.trim();
  const check = name.length >= MIN_LENGTH ? checkCommunitySlug(name) : null;
  const slug = check?.ok ? check.slug : null;
  const [answer, setAnswer] = useState<{ name: string; available: boolean | null; reason: string | null } | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    if (!slug) return;
    const request = ++latest.current;
    const timer = setTimeout(async () => {
      let available: boolean | null = null;
      let reason: string | null = null;
      try {
        const res = await fetch(
          `/api/community/check-availability?name=${encodeURIComponent(name)}&slug=${encodeURIComponent(slug)}`
        );
        if (res.ok) {
          const data = await res.json();
          available = !!data.available;
          reason = data.available ? null : data.reason || "This name is already taken";
        }
      } catch {
        // Unknown: creating the community checks again on the server.
      }
      if (request === latest.current) setAnswer({ name, available, reason });
    }, delayMs);
    return () => clearTimeout(timer);
  }, [name, slug, delayMs]);

  if (!check) return { status: "idle", message: null, slug: null };
  if (!check.ok) return { status: "invalid", message: check.error, slug: null };
  if (answer?.name !== name) return { status: "checking", message: null, slug: check.slug };
  if (answer.available === null) return { status: "unknown", message: null, slug: check.slug };
  if (answer.available) return { status: "available", message: null, slug: check.slug };
  return { status: "taken", message: answer.reason ?? "This name is already taken", slug: check.slug };
}
