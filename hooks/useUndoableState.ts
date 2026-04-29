'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UndoableState<T> {
  past: T[];
  present: T;
  future: T[];
}

interface UseUndoableOptions<T> {
  /**
   * Called every time the committed value changes (set / undo / redo).
   * Debounced changes during a typing burst still emit per keystroke;
   * only the history push is debounced.
   */
  onCommit?: (value: T) => void;
  /** Milliseconds to debounce the history push. Defaults to 500. */
  debounceMs?: number;
  /** Cap on the past stack length to prevent unbounded growth. Defaults to 50. */
  limit?: number;
}

export interface UseUndoableResult<T> {
  value: T;
  setValue: (next: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * useUndoableState — a useState-shaped hook with an in-session undo/redo
 * history. The current value updates synchronously on `setValue`, but the
 * history push happens after a `debounceMs` quiet window so that a burst of
 * keystrokes collapses into a single history entry (otherwise undo would
 * step character-by-character).
 *
 * `undo` / `redo` flush any pending debounce immediately and step the
 * history pointer; both fire `onCommit` so callers (parent state, persist
 * layer) can react.
 */
export function useUndoableState<T>(
  initial: T,
  { onCommit, debounceMs = 500, limit = 50 }: UseUndoableOptions<T> = {},
): UseUndoableResult<T> {
  const [state, setState] = useState<UndoableState<T>>({
    past: [],
    present: initial,
    future: [],
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The value as of the last committed history entry. Differs from
  // state.present during a debounce window.
  const lastCommittedRef = useRef<T>(initial);

  // Keep the latest onCommit in a ref so setValue/undo/redo identities stay stable.
  const onCommitRef = useRef(onCommit);
  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const setValue = useCallback(
    (next: T) => {
      setState((prev) => ({ ...prev, present: next }));
      onCommitRef.current?.(next);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setState((prev) => {
          if (Object.is(prev.present, lastCommittedRef.current)) return prev;
          const trimmedPast =
            prev.past.length >= limit ? prev.past.slice(-(limit - 1)) : prev.past;
          const updated: UndoableState<T> = {
            past: [...trimmedPast, lastCommittedRef.current],
            present: prev.present,
            future: [],
          };
          lastCommittedRef.current = prev.present;
          return updated;
        });
      }, debounceMs);
    },
    [debounceMs, limit],
  );

  const undo = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setState((prev) => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      lastCommittedRef.current = previous;
      onCommitRef.current?.(previous);
      return {
        past: prev.past.slice(0, -1),
        present: previous,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setState((prev) => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      lastCommittedRef.current = next;
      onCommitRef.current?.(next);
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: prev.future.slice(1),
      };
    });
  }, []);

  return {
    value: state.present,
    setValue,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
