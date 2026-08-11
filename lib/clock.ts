"use client";

// Wall-clock time as a React value.
//
// Reading `Date.now()` while rendering makes a component non-idempotent: two
// renders of the same state produce different output. Exposing the clock as an
// external store instead keeps the component pure and gives it a defined
// update cadence.

import { useMemo, useSyncExternalStore } from "react";

const MINUTE_MS = 60_000;

function subscribeToMinutes(onChange: () => void): () => void {
  const id = setInterval(onChange, MINUTE_MS);
  return () => clearInterval(id);
}

/**
 * The current time, rounded down to the minute so the value stays stable
 * between ticks. 0 during prerendering, where there is no meaningful "now".
 */
export function useNow(): number {
  return useSyncExternalStore(
    subscribeToMinutes,
    () => Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS,
    () => 0,
  );
}

/**
 * The same clock as a Date, or null where there is no meaningful "now" (the
 * prerender). Callers render a placeholder for null rather than substituting
 * `Date.now()`, which would be an impure call during render and would make the
 * component non-idempotent — the very thing this module exists to avoid.
 */
export function useNowDate(): Date | null {
  const ms = useNow();
  return useMemo(() => (ms === 0 ? null : new Date(ms)), [ms]);
}
