// The contract between the news widget and the proxy route.
//
// Shared by both sides so the path and the shape exist once. Nothing in here
// is server-only or browser-only: it is the wire format and the two constants
// that describe it.

import type { NewsFetchError, NewsItem } from "./types";

/** Where the proxy route is mounted in a server build (docs/news.md, next.config.ts). */
export const NEWS_API_PATH = "/api/news";

/**
 * How many feeds one request may ask for. The whole point of batching is that
 * a refresh is one round trip instead of nine; the cap is what keeps that from
 * turning the route into an open amplifier.
 */
export const MAX_FEEDS_PER_REQUEST = 12;

/** How long the route serves a feed from its own memory before asking again. */
export const NEWS_CACHE_TTL_MS = 15 * 60_000;

export interface NewsProxyFeedResult {
  /** The feed URL, exactly as it was asked for, so the caller can match it up. */
  feed: string;
  items: NewsItem[];
  /** When these items were read from the publisher, ms epoch. */
  fetchedAt: number;
  /** Absent on success. */
  error?: NewsFetchError;
}

export interface NewsProxyResponse {
  results: NewsProxyFeedResult[];
}

/** The request URL for a set of feeds, relative to the app's own origin. */
export function newsRequestPath(feeds: string[], base = NEWS_API_PATH): string {
  const params = new URLSearchParams();
  for (const feed of feeds.slice(0, MAX_FEEDS_PER_REQUEST)) params.append("feed", feed);
  return `${base}?${params.toString()}`;
}
