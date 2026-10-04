"use client";

import { useSyncExternalStore } from "react";

// Lets a page put a search box in the community top bar. The feed registers
// an opener while it is mounted; the top bar shows the button only then.
type Opener = () => void;
let opener: Opener | null = null;
let label = "";
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function registerPageSearch(open: Opener, searchLabel: string): () => void {
  opener = open;
  label = searchLabel;
  emit();
  return () => {
    if (opener === open) {
      opener = null;
      label = "";
      emit();
    }
  };
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The current page's search, or null when the page has none. */
export function usePageSearch(): { open: Opener; label: string } | null {
  const current = useSyncExternalStore(subscribe, () => opener, () => null);
  const currentLabel = useSyncExternalStore(subscribe, () => label, () => "");
  return current ? { open: current, label: currentLabel } : null;
}
