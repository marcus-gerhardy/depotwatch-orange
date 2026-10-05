// The feed proxy: everything the route does, minus the framework.
//
// Why a proxy exists at all, in an app that otherwise talks to nobody on the
// user's behalf: RSS and Atom feeds do not send CORS headers (none of the nine
// shipped ones does), so a browser is simply not allowed to read them. This is
// the only feature in DepotWatch that cannot work without something in
// between, which is also why it only exists in the server build
// (next.config.ts) and why the widget says so plainly where it does not.
//
// The rules this thing lives under:
//
//  • **Allowlist, not "any URL".** A route that fetches whatever it is handed
//    is a server-side request forgery hole. Shipped feeds pass because they
//    are in `config/news-feeds/feeds.json`; anything else has to satisfy
//    `checkFeedUrl` — and again after every redirect, since a redirect is a
//    URL somebody else chose.
//  • **Nothing of the user's goes through here.** The request carries feed
//    URLs and nothing else. No portfolio data, no addresses, no identifier,
//    no cookie — there is nothing for one to be set by.
//  • **Cache, and honour the publisher's own headers.** Nine publishers should
//    not be asked again because two people opened a dashboard. A response is
//    held for at least 15 minutes, longer if the feed says so, and revalidated
//    with `If-None-Match`/`If-Modified-Since` so the usual case costs a 304.
//  • **Say who is asking.** A real User-Agent with the project name and the
//    repository, so an administrator seeing it in a log can find out what it
//    is and complain to the right place.

import { checkFeedUrl } from "./urlPolicy";
import { looksLikeFeed, parseFeed } from "./feedParse";
import { SYSTEM_FEED_URLS } from "./feeds";
import {
  MAX_FEEDS_PER_REQUEST,
  NEWS_CACHE_TTL_MS,
  type NewsProxyFeedResult,
  type NewsProxyResponse,
} from "./protocol";
import type { NewsFetchError, NewsItem } from "./types";
import { REPOSITORY_URL } from "../site";

/** Named so an administrator reading a log can tell what this is. */
const USER_AGENT = `DepotWatch/1.0 (+${REPOSITORY_URL}) news-widget`;

/** A feed that does not answer in this long is treated as unreachable. */
const FETCH_TIMEOUT_MS = 10_000;

/** A feed is a few hundred kilobytes. Past this something is wrong. */
const MAX_FEED_BYTES = 4 * 1024 * 1024;

/** A publisher asking to be cached for longer is obeyed, up to this. */
const MAX_CACHE_TTL_MS = 6 * 60 * 60_000;

/** Redirects are followed by hand so every hop can be checked. */
const MAX_REDIRECTS = 3;

interface CacheEntry {
  items: NewsItem[];
  /** When the publisher was last actually asked (a 304 refreshes it). */
  fetchedAt: number;
  /** How long this entry stays fresh, from the feed's own headers. */
  ttlMs: number;
  etag?: string;
  lastModified?: string;
}

/**
 * Module-level and therefore per server instance. Deliberately not a shared
 * store: the cache is a courtesy to the publishers, not a source of truth, and
 * a cold instance simply fetches once.
 */
const cache = new Map<string, CacheEntry>();

/** Test seam; also what a redeploy does on its own. */
export function clearNewsProxyCache(): void {
  cache.clear();
}

/**
 * How long to hold a response, from its own `Cache-Control`/`Expires`.
 * Never below the app's own 15 minutes: a feed saying `no-store` is talking
 * about a browser cache, and asking a publisher every few seconds because they
 * said so would be the opposite of considerate.
 */
export function cacheTtlFrom(headers: Headers, now: number): number {
  const control = headers.get("cache-control") ?? "";
  const maxAge = /(?:^|,)\s*s-maxage\s*=\s*(\d+)/i.exec(control)
    ?? /(?:^|,)\s*max-age\s*=\s*(\d+)/i.exec(control);
  if (maxAge) {
    const ms = Number(maxAge[1]) * 1000;
    return Math.min(Math.max(ms, NEWS_CACHE_TTL_MS), MAX_CACHE_TTL_MS);
  }
  const expires = headers.get("expires");
  if (expires) {
    const at = Date.parse(expires);
    if (Number.isFinite(at)) {
      return Math.min(Math.max(at - now, NEWS_CACHE_TTL_MS), MAX_CACHE_TTL_MS);
    }
  }
  return NEWS_CACHE_TTL_MS;
}

/** May this URL be fetched: on the shipped list, or acceptable on its own. */
export function isAllowedFeed(url: string): boolean {
  if (SYSTEM_FEED_URLS.has(url)) return true;
  return checkFeedUrl(url).ok;
}

export interface ProxyDeps {
  fetch: typeof globalThis.fetch;
  now: () => number;
}

const defaultDeps: ProxyDeps = { fetch: globalThis.fetch, now: () => Date.now() };

/**
 * One request to a publisher, following redirects by hand.
 *
 * `redirect: "manual"` rather than letting fetch follow: a redirect target is
 * a URL chosen by somebody else, and "no redirects into a private network" is
 * only true if every hop is checked. Which is also why the *final* URL is what
 * gets fetched, never a hop that was skipped over.
 */
async function fetchFollowing(
  url: string,
  headers: Record<string, string>,
  deps: ProxyDeps,
): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await deps.fetch(current, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // Nothing of the user's may ride along, and there is nothing to ride:
      // this runs on the server, with no cookie jar and no session.
      credentials: "omit",
      cache: "no-store",
    });
    if (res.status < 300 || res.status > 399) return res;

    const location = res.headers.get("location");
    if (location === null) return res;
    const next = checkFeedUrl(new URL(location, current).toString());
    // A redirect that leaves the rules is where an attack would arrive, so it
    // is a refusal rather than a fetch.
    if (!next.ok) throw new Error(`redirect to a URL that is not allowed: ${next.problem}`);
    current = next.url;
  }
  throw new Error("too many redirects");
}

/** Read the body, refusing anything absurdly large before it is in memory. */
async function readBounded(res: Response): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_FEED_BYTES) {
    throw new Error("feed too large");
  }
  const text = await res.text();
  if (text.length > MAX_FEED_BYTES) throw new Error("feed too large");
  return text;
}

/**
 * One feed, from the cache where possible.
 *
 * A cached entry past its TTL is revalidated rather than refetched: the
 * publisher answers 304, the entry keeps its items and gets a new timestamp,
 * and everyone has saved the transfer. A failed refresh keeps serving what is
 * already held — stale headlines beat an error state for something nobody is
 * waiting on.
 */
export async function fetchFeedCached(
  feedUrl: string,
  deps: ProxyDeps = defaultDeps,
): Promise<NewsProxyFeedResult> {
  const now = deps.now();
  const hit = cache.get(feedUrl);
  if (hit && now - hit.fetchedAt < hit.ttlMs) {
    return { feed: feedUrl, items: hit.items, fetchedAt: hit.fetchedAt };
  }

  const headers: Record<string, string> = {
    "user-agent": USER_AGENT,
    accept: "application/atom+xml, application/rss+xml, application/xml;q=0.9, text/xml;q=0.9",
    "accept-encoding": "gzip, deflate",
  };
  if (hit?.etag) headers["if-none-match"] = hit.etag;
  if (hit?.lastModified) headers["if-modified-since"] = hit.lastModified;

  try {
    const res = await fetchFollowing(feedUrl, headers, deps);

    if (res.status === 304 && hit) {
      const refreshed: CacheEntry = {
        ...hit,
        fetchedAt: now,
        ttlMs: cacheTtlFrom(res.headers, now),
      };
      cache.set(feedUrl, refreshed);
      return { feed: feedUrl, items: refreshed.items, fetchedAt: now };
    }

    if (!res.ok) throw new Error(`status ${res.status}`);

    const body = await readBounded(res);
    if (!looksLikeFeed(body)) {
      return failure(feedUrl, hit, "notAFeed");
    }

    const entry: CacheEntry = {
      items: parseFeed(body, feedUrl),
      fetchedAt: now,
      ttlMs: cacheTtlFrom(res.headers, now),
      etag: res.headers.get("etag") ?? undefined,
      lastModified: res.headers.get("last-modified") ?? undefined,
    };
    cache.set(feedUrl, entry);
    return { feed: feedUrl, items: entry.items, fetchedAt: now };
  } catch (e) {
    const tooLarge = e instanceof Error && e.message === "feed too large";
    return failure(feedUrl, hit, tooLarge ? "tooLarge" : "unreachable");
  }
}

/** A failure still serves what is held, and says that it did not refresh. */
function failure(
  feedUrl: string,
  hit: CacheEntry | undefined,
  error: NewsFetchError,
): NewsProxyFeedResult {
  return {
    feed: feedUrl,
    items: hit?.items ?? [],
    fetchedAt: hit?.fetchedAt ?? 0,
    error,
  };
}

/**
 * The whole route, as a function of the request URL.
 *
 * Kept framework-free so it can be unit-tested with a fake `fetch` and so the
 * route file stays the five lines that adapt it to Next.
 */
export async function handleNewsRequest(
  requestUrl: URL,
  deps: ProxyDeps = defaultDeps,
): Promise<NewsProxyResponse> {
  const asked = requestUrl.searchParams.getAll("feed").slice(0, MAX_FEEDS_PER_REQUEST);

  const results = await Promise.all(
    asked.map(async (feed): Promise<NewsProxyFeedResult> => {
      const checked = checkFeedUrl(feed);
      // Refused rather than fetched, and named as refused rather than as
      // broken: "this installation will not fetch that" is a different thing
      // from "that publisher is down", and the widget says so differently.
      if (!checked.ok || !isAllowedFeed(checked.url)) {
        return { feed, items: [], fetchedAt: 0, error: "notAllowed" };
      }
      const result = await fetchFeedCached(checked.url, deps);
      // Answer under the URL that was asked for, whatever normalising did.
      return { ...result, feed };
    }),
  );

  return { results };
}

/** Response headers for the route: cacheable, and telling nobody anything. */
export function newsResponseHeaders(): Record<string, string> {
  return {
    "content-type": "application/json; charset=utf-8",
    // The route's own answer may be held by a CDN as long as the app holds it.
    "cache-control": `public, max-age=60, s-maxage=${Math.floor(NEWS_CACHE_TTL_MS / 1000)}`,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  };
}
