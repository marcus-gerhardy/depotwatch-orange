"use client";

// Fetching the news from the browser (docs/news.md).
//
// Two transports, tried in that order:
//
//  1. **The proxy route** of this installation (`/api/news`). Feeds do not
//     send CORS headers, so for the shipped sources this is the only one that
//     can work — and it also means the publisher sees the server's request
//     rather than the reader's address.
//  2. **Directly**, for a feed that does send CORS headers. That is the rarer
//     case and mostly a user's own feed, but it is what makes the widget work
//     at all in the static export, where there is no route to ask.
//
// Where neither works the sources are reported as unreachable, one by one and
// with a reason. A widget that cannot reach a publisher is a widget with less
// in it; it is never an error that reaches the dashboard.
//
// Nothing about the user is sent anywhere here. The request carries feed URLs
// and nothing else: no portfolio data, no identifier, no referrer (the app is
// served with `Referrer-Policy: no-referrer`).

import { fetchCached } from "../marketData";
import { parseFeed } from "./feedParse";
import {
  NEWS_API_PATH,
  NEWS_CACHE_TTL_MS,
  newsRequestPath,
  type NewsProxyResponse,
} from "./protocol";
import type { NewsFetchResult, NewsItem, NewsSource } from "./types";

/**
 * Whether this installation has a proxy, remembered for the session.
 *
 * `null` means "not tried yet". Once a 404 has said there is none, the direct
 * transport is used straight away rather than asking again per refresh — a
 * static deployment would otherwise spend one wasted request per cycle
 * forever.
 *
 * An explicit refresh clears it, so a deployment that gains a proxy (or a dev
 * server that was restarted with one) recovers on a click rather than on a
 * page reload. Somebody pressing refresh is asking for the question to be put
 * again, including that one.
 */
let proxyAvailable: boolean | null = null;

/** Test seam, and what a page load does anyway. */
export function resetNewsTransport(): void {
  proxyAvailable = null;
}

export function isProxyKnownMissing(): boolean {
  return proxyAvailable === false;
}

async function viaProxy(sources: NewsSource[]): Promise<NewsFetchResult[] | null> {
  if (proxyAvailable === false) return null;

  let response: Response;
  try {
    response = await fetch(newsRequestPath(sources.map((s) => s.url)), {
      headers: { accept: "application/json" },
    });
  } catch {
    // A network failure says nothing about whether the route exists, so the
    // answer stays unknown and the next refresh asks again.
    return null;
  }

  if (response.status === 404 || response.status === 405) {
    // A static export: the file is not mounted, so there is no proxy here and
    // there never will be until the deployment changes.
    proxyAvailable = false;
    return null;
  }
  if (!response.ok) return null;

  let payload: NewsProxyResponse;
  try {
    payload = (await response.json()) as NewsProxyResponse;
    if (!Array.isArray(payload.results)) return null;
  } catch {
    // Something answered, but not the route — a host serving index.html for
    // every unknown path, for instance.
    proxyAvailable = false;
    return null;
  }

  proxyAvailable = true;
  const byFeed = new Map(payload.results.map((r) => [r.feed, r]));
  return sources.map((source) => {
    const result = byFeed.get(source.url);
    if (!result) {
      return { sourceId: source.id, items: [], fetchedAt: 0, error: "unreachable" as const };
    }
    return {
      sourceId: source.id,
      // The route knows feeds, not sources, so the items come back stamped
      // with the URL. Re-stamp them here, where the source id is known.
      items: result.items.map((item) => ({ ...item, sourceId: source.id })),
      fetchedAt: result.fetchedAt,
      error: result.error,
    };
  });
}

/** One feed, read straight from the publisher. Works only where CORS allows. */
async function directly(source: NewsSource): Promise<NewsFetchResult> {
  const fetchedAt = Date.now();
  try {
    const res = await fetch(source.url, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const items = parseFeed(await res.text(), source.id);
    return { sourceId: source.id, items, fetchedAt };
  } catch {
    return {
      sourceId: source.id,
      items: [],
      fetchedAt: 0,
      // Without a proxy this is the expected outcome for a feed that sends no
      // CORS headers, which is most of them. Named as its own reason so the
      // widget can explain the installation rather than blame the publisher.
      error: proxyAvailable === false ? "noProxy" : "unreachable",
    };
  }
}

/**
 * Read every enabled source once.
 *
 * Goes through the shared request cache of `lib/marketData`, so a re-render
 * never becomes a request, two widgets asking at once share one, and the
 * auto-lock (§6.4) can see that something is in flight.
 */
export function loadNews(
  sources: NewsSource[],
  force = false,
): Promise<NewsFetchResult[]> {
  if (sources.length === 0) return Promise.resolve([]);
  if (force) proxyAvailable = null;
  const key = `news:${sources.map((s) => s.url).join("|")}`;
  return fetchCached(
    key,
    NEWS_CACHE_TTL_MS,
    async () => {
      const proxied = await viaProxy(sources);
      if (proxied !== null) return proxied;
      return Promise.all(sources.map(directly));
    },
    force,
  );
}

// ---------------------------------------------------------------------------
// What was last seen
// ---------------------------------------------------------------------------

/**
 * The last headlines this browser loaded, with the time it loaded them.
 *
 * Kept in `localStorage` for the same reason the last BTC price is (§7.2):
 * offline, a list of yesterday's headlines with "as of yesterday 21:04" over
 * it is better than an error, and after a reload an in-memory cache has
 * nothing to say. These are public articles, identical for every reader and
 * carrying no trace of what anybody holds. Nothing about the portfolio is ever
 * persisted this way.
 */
const SNAPSHOT_KEY = "depotwatch.news.v1";

/** A snapshot stays small: enough to fill a tile, not a personal archive. */
const SNAPSHOT_ITEMS = 40;

export interface NewsSnapshot {
  items: NewsItem[];
  at: number;
}

export function readNewsSnapshot(): NewsSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<NewsSnapshot>;
    if (!Array.isArray(parsed.items) || typeof parsed.at !== "number") return null;
    return { items: parsed.items, at: parsed.at };
  } catch {
    return null;
  }
}

export function writeNewsSnapshot(items: NewsItem[], at: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify({ items: items.slice(0, SNAPSHOT_ITEMS), at } satisfies NewsSnapshot),
    );
  } catch {
    // Storage full or blocked: a stale list is a nicety, not worth an error.
  }
}

/** Forget what was stored — the settings offer this when news is switched off. */
export function clearNewsSnapshot(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    // Nothing to do: there is no state to keep consistent.
  }
}

/** Where the proxy would be, for the settings to name it. */
export const NEWS_PROXY_PATH = NEWS_API_PATH;
