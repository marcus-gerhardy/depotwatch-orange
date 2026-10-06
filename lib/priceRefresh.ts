// When the spot price is fetched again, and how old a price may get before it
// is called old. Pure functions over timestamps: the feed in lib/priceFeed.ts
// asks these once a second and acts on the answer, which is what keeps the
// rules testable without a timer, a tab or a network.

import type { PriceRefresh } from "./types";

export type { PriceRefresh };

/** The choices the settings offer, in seconds; "manual" = only on request. */
export const PRICE_REFRESH_CHOICES: readonly PriceRefresh[] = [15, 30, 60, 300, "manual"];
export const DEFAULT_PRICE_REFRESH: PriceRefresh = 60;

export function isPriceRefresh(v: unknown): v is PriceRefresh {
  return (PRICE_REFRESH_CHOICES as readonly unknown[]).includes(v);
}

/** The interval in ms, or null for "manual". Anything unknown is the default. */
export function refreshIntervalMs(choice: unknown): number | null {
  const c = isPriceRefresh(choice) ? choice : DEFAULT_PRICE_REFRESH;
  return c === "manual" ? null : c * 1000;
}

/** First retry after an ordinary failure (network, 5xx). */
export const BACKOFF_BASE_MS = 15_000;
/** First retry after the source said "too many requests". */
export const RATE_LIMIT_BASE_MS = 60_000;
/** No backoff grows past this: a source that is back should be noticed. */
export const BACKOFF_MAX_MS = 10 * 60_000;

/**
 * How long to wait after the `failures`-th failure in a row: doubling from the
 * base, capped. A rate limit starts higher, and a `Retry-After` the server
 * sent is honoured when it asks for more than that.
 */
export function backoffMs(
  failures: number,
  rateLimited: boolean,
  retryAfterMs: number | null = null,
): number {
  const base = rateLimited ? RATE_LIMIT_BASE_MS : BACKOFF_BASE_MS;
  const exp = Math.min(Math.max(failures, 1) - 1, 16);
  const delay = Math.min(base * 2 ** exp, BACKOFF_MAX_MS);
  return retryAfterMs !== null && retryAfterMs > delay
    ? Math.min(retryAfterMs, 60 * 60_000)
    : delay;
}

export interface ScheduleState {
  now: number;
  /** When the price on screen was read (also one remembered from last time). */
  lastSuccessAt: number | null;
  /** Set while backing off after a failure: nothing automatic before then. */
  retryAt: number | null;
  /** Null for "manual". */
  intervalMs: number | null;
  /** Whether this session has fetched at all yet. */
  fetchedThisSession: boolean;
}

/**
 * Is an automatic fetch due?
 *
 * A backoff wins over everything. After that the interval decides, measured
 * from the last successful reading rather than from the last tick — which is
 * what makes a throttled background timer harmless: however late the tick
 * comes, it compares clocks rather than counting. "Manual" fetches once when
 * the file is opened (otherwise every value would read "—" until somebody
 * clicks) and never again on its own.
 */
export function isFetchDue(s: ScheduleState): boolean {
  if (s.retryAt !== null) return s.now >= s.retryAt;
  if (s.intervalMs === null) return !s.fetchedThisSession && s.lastSuccessAt === null;
  if (s.lastSuccessAt === null) return true;
  return s.now - s.lastSuccessAt >= s.intervalMs;
}

/**
 * Returning to the tab refreshes at once — but not for a tab that was away for
 * a moment: switching back and forth must not turn into a request each time.
 */
export const RETURN_REFRESH_MIN_AGE_MS = 10_000;

export function isReturnRefreshDue(s: ScheduleState): boolean {
  if (s.retryAt !== null && s.now < s.retryAt) return false;
  if (s.intervalMs === null) return false;
  return s.lastSuccessAt === null || s.now - s.lastSuccessAt >= RETURN_REFRESH_MIN_AGE_MS;
}

/** Below this, a price is never called stale, whatever the interval. */
const STALE_FLOOR_MS = 2 * 60_000;
/** With manual refresh there is no interval to measure against. */
const STALE_MANUAL_MS = 15 * 60_000;

/**
 * A price is stale once it has missed a few refreshes: three intervals, at
 * least two minutes. That tolerates one failed request without alarm and says
 * so clearly once the figure on screen is no longer the market's.
 */
export function isPriceStale(ageMs: number, intervalMs: number | null): boolean {
  const limit =
    intervalMs === null ? STALE_MANUAL_MS : Math.max(3 * intervalMs, STALE_FLOOR_MS);
  return ageMs > limit;
}

export type PriceDirection = "up" | "down";

/** Which way the price moved, or null when it did not (or there is nothing to compare). */
export function priceDirection(
  previous: number | null,
  next: number,
): PriceDirection | null {
  if (previous === null || previous === next) return null;
  return next > previous ? "up" : "down";
}
