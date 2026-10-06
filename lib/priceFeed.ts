"use client";

// The BTC spot price: fetched in exactly one place, read everywhere.
//
// Portfolio value, profit and loss, break-even, the what-if calculator and
// every balance shown in a fiat currency need the same number at the same
// moment. So there is one module-level feed and every component subscribes to
// it (`usePriceFeed`); nobody fetches a spot price on their own. The feed runs
// while at least one component is subscribed and stops — timers, listeners,
// the request in flight — when the last one goes away.
//
// **When** it fetches is decided by lib/priceRefresh.ts, asked once a second:
// the interval from the file's settings, measured as a timestamp comparison
// rather than by trusting `setInterval` (background tabs throttle it), and a
// backoff after a failure that grows faster for a rate limit. It does not
// fetch while the tab is hidden, while the app is locked or while the browser
// is offline, and returning to the tab refreshes once, right away.
//
// A failed refresh never empties anything: the last good price stays, tagged
// with when it was read and why it is not newer, and the UI says so.
//
// The price is not portfolio data. It is not written to the file (that would
// mark it as changed every minute) but remembered in localStorage, so that
// after a reload or offline the app can say "54 830 €, as of 18:20" instead of
// a dash. The request carries nothing but the trading pair.

import { useSyncExternalStore } from "react";
import { fetchSpotPrice, PriceHttpError } from "./binance";
import { useAppStore } from "./store";
import {
  backoffMs,
  isFetchDue,
  isReturnRefreshDue,
  priceDirection,
  refreshIntervalMs,
  type PriceDirection,
  type ScheduleState,
} from "./priceRefresh";

export interface SpotPrices {
  eur: number;
  usd: number;
}

export type PriceFailure = "network" | "http" | "rateLimit";

export interface PriceFeedState {
  /** The last good reading; null only before there has ever been one. */
  prices: SpotPrices | null;
  /** Epoch ms of that reading. */
  at: number | null;
  /** The reading is remembered from an earlier session, not fetched in this one. */
  remembered: boolean;
  /** A request is running. */
  fetching: boolean;
  /** Why the last attempt failed; null when it succeeded. */
  failure: PriceFailure | null;
  /** Failures in a row, for the backoff. */
  failures: number;
  /** No automatic attempt before this (epoch ms); null when not backing off. */
  retryAt: number | null;
  /** Which way the EUR price moved with the last reading. */
  direction: PriceDirection | null;
  /** Counts the changes, so the same direction twice still flashes twice. */
  changeSeq: number;
  /** The configured interval (null = manual), for judging staleness. */
  intervalMs: number | null;
}

const TICK_MS = 1_000;

function initialState(): PriceFeedState {
  return {
    prices: null,
    at: null,
    remembered: false,
    fetching: false,
    failure: null,
    failures: 0,
    retryAt: null,
    direction: null,
    changeSeq: 0,
    intervalMs: refreshIntervalMs(undefined),
  };
}

/** What the prerender sees: nothing, and no clock. */
const SERVER_STATE: PriceFeedState = initialState();

let state: PriceFeedState = initialState();
let fetchedThisSession = false;
const listeners = new Set<() => void>();

function setState(patch: Partial<PriceFeedState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

// ── Remembered price ─────────────────────────────────────────────────────────

const LAST_PRICE_KEY = "depotwatch.lastPrice.v1";

interface StoredPrices extends SpotPrices {
  at: number;
}

function readLastPrices(): StoredPrices | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_PRICE_KEY);
    if (raw === null) return null;
    const p = JSON.parse(raw) as Partial<StoredPrices>;
    return typeof p.eur === "number" &&
      typeof p.usd === "number" &&
      typeof p.at === "number" &&
      p.eur > 0 &&
      p.usd > 0
      ? { eur: p.eur, usd: p.usd, at: p.at }
      : null;
  } catch {
    return null;
  }
}

function writeLastPrices(prices: SpotPrices, at: number): void {
  try {
    localStorage.setItem(LAST_PRICE_KEY, JSON.stringify({ ...prices, at }));
  } catch {
    // Storage full or unavailable: a remembered price is a nicety.
  }
}

// ── Fetching ─────────────────────────────────────────────────────────────────

let inFlight: AbortController | null = null;

function classify(error: unknown): PriceFailure {
  if (error instanceof PriceHttpError) return error.rateLimited ? "rateLimit" : "http";
  return "network";
}

async function fetchNow(): Promise<void> {
  if (inFlight) return;
  const controller = new AbortController();
  inFlight = controller;
  fetchedThisSession = true;
  setState({ fetching: true });
  try {
    // Two requests, one pair per refresh for the whole app: EUR is what
    // everything is valued in, USD only feeds the display conversion.
    const [eur, usd] = await Promise.all([
      fetchSpotPrice("EUR", controller.signal),
      fetchSpotPrice("USD", controller.signal),
    ]);
    if (controller.signal.aborted) return;
    const at = Date.now();
    const direction = priceDirection(state.prices?.eur ?? null, eur);
    writeLastPrices({ eur, usd }, at);
    setState({
      prices: { eur, usd },
      at,
      remembered: false,
      fetching: false,
      failure: null,
      failures: 0,
      retryAt: null,
      direction: direction ?? state.direction,
      changeSeq: direction ? state.changeSeq + 1 : state.changeSeq,
    });
  } catch (error) {
    // Stopped on purpose (locked, unmounted): not a failure of the source.
    if (controller.signal.aborted) return;
    const failures = state.failures + 1;
    const failure = classify(error);
    const retryAfter = error instanceof PriceHttpError ? error.retryAfterMs : null;
    setState({
      fetching: false,
      failure,
      failures,
      retryAt: Date.now() + backoffMs(failures, failure === "rateLimit", retryAfter),
    });
  } finally {
    if (inFlight === controller) inFlight = null;
    // An aborted request leaves `fetching` behind; clear it without a re-render
    // storm (setState only when it is actually set).
    if (controller.signal.aborted && state.fetching) setState({ fetching: false });
  }
}

function abortInFlight(): void {
  inFlight?.abort();
  inFlight = null;
}

// ── The controller ───────────────────────────────────────────────────────────

function schedule(now: number): ScheduleState {
  return {
    now,
    lastSuccessAt: state.at,
    retryAt: state.retryAt,
    intervalMs: state.intervalMs,
    fetchedThisSession,
  };
}

/** Whether the app is in a state where fetching is allowed at all. */
function blocked(): boolean {
  if (useAppStore.getState().locked) return true;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return false;
}

function tick(): void {
  // The setting may have changed since the last tick; it is read from the
  // open file every time rather than pushed in, so there is nothing to sync.
  const intervalMs = refreshIntervalMs(
    useAppStore.getState().portfolio?.uiSettings?.priceRefresh,
  );
  if (intervalMs !== state.intervalMs) setState({ intervalMs });

  if (useAppStore.getState().locked) {
    // Locking stops a request that is halfway in, too: nothing runs behind
    // the lock screen.
    abortInFlight();
    return;
  }
  if (blocked() || inFlight) return;
  if (isFetchDue(schedule(Date.now()))) void fetchNow();
}

function onVisibilityChange(): void {
  if (blocked() || inFlight) return;
  if (isReturnRefreshDue(schedule(Date.now()))) void fetchNow();
}

function onOnline(): void {
  // Back online: whatever failed was the connection, not the source, so the
  // backoff it caused no longer applies. A rate limit still does.
  if (state.failure !== "rateLimit" && state.retryAt !== null) {
    setState({ retryAt: null, failures: 0 });
  }
  tick();
}

let timer: ReturnType<typeof setInterval> | null = null;

function start(): void {
  if (state.prices === null) {
    const last = readLastPrices();
    if (last) {
      setState({
        prices: { eur: last.eur, usd: last.usd },
        at: last.at,
        remembered: true,
      });
    }
  }
  timer = setInterval(tick, TICK_MS);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  if (typeof window !== "undefined") window.addEventListener("online", onOnline);
  tick();
}

function stop(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", onVisibilityChange);
  }
  if (typeof window !== "undefined") window.removeEventListener("online", onOnline);
  abortInFlight();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/** The shared price state. Subscribing is what keeps the feed running. */
export function usePriceFeed(): PriceFeedState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
}

/**
 * Whether a manual refresh is possible right now: not while one is running,
 * not while locked, and not while the source has asked us to slow down —
 * clicking does not make a rate limit go away, it extends it.
 */
export function canRefreshNow(s: PriceFeedState, now: number): boolean {
  if (s.fetching) return false;
  return !(s.failure === "rateLimit" && s.retryAt !== null && now < s.retryAt);
}

/** The refresh button. It ignores an ordinary backoff (somebody asked on purpose), and a success clears it. */
export function refreshPricesNow(): void {
  if (useAppStore.getState().locked) return;
  if (!canRefreshNow(state, Date.now())) return;
  void fetchNow();
}

/** For the tests: forget everything, as if the page had just loaded. */
export function resetPriceFeed(): void {
  stop();
  state = initialState();
  fetchedThisSession = false;
  if (listeners.size > 0) start();
}
