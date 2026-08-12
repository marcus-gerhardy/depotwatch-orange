"use client";

// Cached, de-duplicated access to the external data the dashboard widgets
// need: BTC prices (Binance) and on-chain figures (the *configured* explorer,
// never a hard-wired third party — see CLAUDE.md §3.3).
//
// Every widget mounts independently, several want the same figure, and a
// re-render must not become a request. So each resource is fetched through one
// module-level cache: a fresh value is returned straight away, a request that
// is already running is shared, and a failure is remembered briefly too (an
// unreachable explorer must not turn into a request storm).

import { useCallback, useEffect, useState } from "react";
import { fetchDailyCloses, fetchSpotPrice, type DailyClose } from "./binance";
import {
  fetchFeeEstimates,
  fetchTipHeight,
  explorerBase,
  type FeeEstimates,
} from "./esplora";
import type { ExplorerSettings, FiatCurrency } from "./types";

interface CacheEntry {
  /** Resolved value, when the last attempt succeeded. */
  value?: unknown;
  /** Rejection reason, when it failed. */
  error?: unknown;
  at: number;
  /** In-flight request, shared by every caller asking for the same key. */
  pending?: Promise<unknown>;
}

const cache = new Map<string, CacheEntry>();

/** How long a failed attempt is remembered before the next one is allowed. */
const ERROR_TTL_MS = 20_000;

/**
 * Run `load` at most once per `key` per `ttlMs`, sharing the result with every
 * concurrent caller. `force` skips a fresh cache entry (an explicit refresh
 * click) but still joins a request that is already running.
 */
export function fetchCached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  force = false,
): Promise<T> {
  const hit = cache.get(key);
  if (hit?.pending) return hit.pending as Promise<T>;
  if (hit && !force) {
    const age = Date.now() - hit.at;
    if ("error" in hit && age < ERROR_TTL_MS) return Promise.reject(hit.error);
    if ("value" in hit && age < ttlMs) return Promise.resolve(hit.value as T);
  }
  const pending = load().then(
    (value) => {
      cache.set(key, { value, at: Date.now() });
      return value;
    },
    (error: unknown) => {
      cache.set(key, { error, at: Date.now() });
      throw error;
    },
  );
  cache.set(key, { ...hit, pending, at: hit?.at ?? 0 });
  return pending;
}

/**
 * How many requests are in flight right now. The auto-lock (§6.4) asks before
 * locking: a price series that is halfway in is a long-running operation like
 * an import is, and tearing the session down under it would leave the widget
 * that asked for it with an error instead of a figure.
 */
export function pendingRequestCount(): number {
  let n = 0;
  for (const entry of cache.values()) if (entry.pending) n += 1;
  return n;
}

/** Drop every cached figure — used by the tests and by a manual refresh. */
export function clearMarketDataCache(): void {
  cache.clear();
}

export interface Resource<T> {
  data: T | null;
  /** True while the first value for the current key is still outstanding. */
  loading: boolean;
  error: boolean;
  /** Re-fetch now, bypassing the cache TTL. */
  reload: () => void;
}

/** What the hook knows, tagged with the key it belongs to. */
interface ResourceState<T> {
  key: string | null;
  data: T | null;
  error: boolean;
}

/**
 * Subscribe a component to one cached resource. `key` identifies the value
 * (null = nothing to load) and `load` must be stable for that key — every hook
 * below wraps its loader in useCallback, so a changed key is the one thing that
 * restarts a request.
 *
 * The state carries its own key, so switching keys reports "loading" by pure
 * derivation instead of a setState during the effect.
 */
function useResource<T>(
  key: string | null,
  ttlMs: number,
  load: () => Promise<T>,
  /** Optional background refresh interval; omit for one-shot data. */
  refreshMs?: number,
): Resource<T> {
  const [state, setState] = useState<ResourceState<T>>({
    key: null,
    data: null,
    error: false,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    const run = (force: boolean) => {
      fetchCached(key, ttlMs, load, force).then(
        (data) => {
          if (!cancelled) setState({ key, data, error: false });
        },
        // A failed refresh keeps the last good value on screen; only a widget
        // that never had one goes into the error state.
        () => {
          if (!cancelled) {
            setState((s) =>
              s.key === key && s.data !== null ? s : { key, data: null, error: true },
            );
          }
        },
      );
    };
    run(nonce > 0);
    if (refreshMs === undefined) {
      return () => {
        cancelled = true;
      };
    }
    const id = setInterval(() => run(true), refreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [key, ttlMs, refreshMs, nonce, load]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const current = state.key === key ? state : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? false,
    loading: key !== null && current === null,
    reload,
  };
}

const PRICE_TTL_MS = 60_000;
const HISTORY_TTL_MS = 10 * 60_000;
const CHAIN_TTL_MS = 60_000;

export interface SpotPrices {
  eur: number;
  usd: number;
}

/**
 * Live BTC price in both currencies. EUR is always needed (the ledger's
 * valuation currency), USD only for the display conversion — one shared
 * resource keeps that to a single pair of requests for the whole dashboard.
 */
async function loadSpotPrices(): Promise<SpotPrices> {
  const [eur, usd] = await Promise.all([
    fetchSpotPrice("EUR"),
    fetchSpotPrice("USD"),
  ]);
  return { eur, usd };
}

export function useSpotPrices(): Resource<SpotPrices> {
  return useResource<SpotPrices>(
    "binance:spot",
    PRICE_TTL_MS,
    loadSpotPrices,
    PRICE_TTL_MS,
  );
}

/**
 * Daily BTC closes from `startTime` (ms epoch) to today. Several widgets chart
 * the same series, so the start is rounded down to the day — otherwise two
 * callers with timestamps a second apart would each fetch their own copy.
 */
export function useDailyCloses(
  currency: FiatCurrency,
  startTime: number | null,
): Resource<DailyClose[]> {
  const day =
    startTime === null ? null : Math.floor(startTime / 86_400_000) * 86_400_000;
  const load = useCallback(
    () => fetchDailyCloses(currency, day ?? undefined),
    [currency, day],
  );
  return useResource<DailyClose[]>(
    day === null ? null : closesKey(currency, day),
    HISTORY_TTL_MS,
    load,
  );
}

const closesKey = (currency: FiatCurrency, day: number) =>
  `binance:closes:${currency}:${day}`;

/**
 * Daily closes that are **already** cached — this never starts a request.
 *
 * The year in review compares against the market average but must not fetch a
 * year of history for merely being opened (CLAUDE.md §4.2). So it asks what
 * the dashboard has fetched anyway: any cached series that starts at or before
 * the day in question covers it, and the longest one wins. The TTL is
 * deliberately ignored — a daily close of a day that is over does not change,
 * and the only stale value possible is today's.
 */
export function peekDailyCloses(
  currency: FiatCurrency,
  startTime: number,
): DailyClose[] | null {
  const prefix = `binance:closes:${currency}:`;
  let best: DailyClose[] | null = null;
  for (const [key, entry] of cache) {
    if (!key.startsWith(prefix) || entry.value === undefined) continue;
    const start = Number(key.slice(prefix.length));
    if (!Number.isFinite(start) || start > startTime) continue;
    const series = entry.value as DailyClose[];
    if (best === null || series.length > best.length) best = series;
  }
  return best;
}

/**
 * Fetch the daily closes on purpose — an explicit click, never a render. Uses
 * the same cache key as `useDailyCloses`, so what one loads the other reuses.
 */
export function loadDailyCloses(
  currency: FiatCurrency,
  startTime: number,
): Promise<DailyClose[]> {
  const day = Math.floor(startTime / 86_400_000) * 86_400_000;
  return fetchCached(closesKey(currency, day), HISTORY_TTL_MS, () =>
    fetchDailyCloses(currency, day),
  );
}

export function useFeeEstimates(settings: ExplorerSettings): Resource<FeeEstimates> {
  // Depend on the settings' values, not on the object identity: the portfolio
  // object is replaced on every edit, which would otherwise re-fetch endlessly.
  const { provider, customEndpoint } = settings;
  const load = useCallback(
    () => fetchFeeEstimates({ provider, customEndpoint }),
    [provider, customEndpoint],
  );
  return useResource<FeeEstimates>(
    `explorer:fees:${explorerBase(settings)}`,
    CHAIN_TTL_MS,
    load,
    CHAIN_TTL_MS,
  );
}

export function useBlockHeight(settings: ExplorerSettings): Resource<number> {
  const { provider, customEndpoint } = settings;
  const load = useCallback(
    () => fetchTipHeight({ provider, customEndpoint }),
    [provider, customEndpoint],
  );
  return useResource<number>(
    `explorer:tip:${explorerBase(settings)}`,
    CHAIN_TTL_MS,
    load,
    CHAIN_TTL_MS,
  );
}
