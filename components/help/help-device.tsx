"use client";

import Image from "next/image";
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { Segmented } from "@/components/ds/segmented";
import { helpShot, HELP_DEVICE_COOKIE, HELP_SHOT_ALT, type HelpDevice } from "@/lib/help/shots";
import type { HelpLang } from "@/lib/help";
import { HELP_UI } from "@/lib/help/ui";
import { cn } from "@/lib/utils";

// Which screenshots the guides show: the phone's or the computer's. The
// visitor's choice is kept in a cookie, so the server renders the right ones
// and nothing jumps after loading; before they choose, the server guesses from
// the browser (HELP_DEVICE_COOKIE, initialHelpDevice).

const InitialDevice = createContext<HelpDevice>("phone");
const listeners = new Set<() => void>();
// The choice made on this page, which wins even when cookies are blocked.
let chosen: HelpDevice | null = null;

function savedDevice(): HelpDevice | null {
  const value = document.cookie.match(new RegExp(`(?:^|; )${HELP_DEVICE_COOKIE}=(phone|desktop)`))?.[1];
  return value === "phone" || value === "desktop" ? value : null;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function chooseDevice(device: HelpDevice) {
  chosen = device;
  document.cookie = `${HELP_DEVICE_COOKIE}=${device}; path=/help; max-age=31536000; samesite=lax`;
  listeners.forEach((l) => l());
}

function useHelpDevice(): HelpDevice {
  const initial = useContext(InitialDevice);
  return useSyncExternalStore(subscribe, () => chosen ?? savedDevice() ?? initial, () => initial);
}

/** Wraps an article: the device the server rendered its screenshots for. */
export function HelpDeviceProvider({ initial, children }: { initial: HelpDevice; children: ReactNode }) {
  return <InitialDevice.Provider value={initial}>{children}</InitialDevice.Provider>;
}

export function HelpDeviceToggle({ lang }: { lang: HelpLang }) {
  const device = useHelpDevice();
  const t = HELP_UI[lang];
  return (
    <div className="flex flex-wrap items-center gap-2.5 text-[14px] text-ink-2">
      <span aria-hidden="true">{t.screenshotsLabel}</span>
      <Segmented<HelpDevice>
        label={t.screenshotsLabel}
        value={device}
        onChange={chooseDevice}
        options={[
          {
            value: "phone",
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
                {t.phone}
              </span>
            ),
          },
          {
            value: "desktop",
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
                {t.desktop}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}

export function HelpShot({ id, lang }: { id: string; lang: HelpLang }) {
  const shot = helpShot(id, useHelpDevice());
  if (!shot) return null;
  const phone = shot.device === "phone";
  return (
    // Never wider than it was on screen, so a small card isn't blown up.
    <figure className="mt-3.5 w-full" style={{ maxWidth: phone ? Math.min(300, shot.cssWidth) : shot.cssWidth }}>
      <Image
        src={shot.src}
        width={shot.width}
        height={shot.height}
        alt={HELP_SHOT_ALT[id]?.[lang] ?? ""}
        sizes={phone ? "300px" : `(min-width: 1024px) ${Math.min(720, shot.cssWidth)}px, 100vw`}
        className={cn("h-auto w-full border border-line bg-surface shadow-card", phone ? "rounded-[22px]" : "rounded-xl")}
      />
    </figure>
  );
}
