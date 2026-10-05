// Many feeds, one list.
//
// Strictly chronological, newest first, and nothing else (docs/news.md).
// There is no ranking here and there must not be one: a list sorted by
// anything but time is a list that has decided what is exciting, and an
// exciting headline next to somebody's savings is precisely the thing this
// widget is not for.

import type { NewsFetchResult, NewsItem, NewsSource } from "./types";

/**
 * Merge the results into one timeline.
 *
 * Two entries with the same id are the same article seen twice (a refresh
 * overlapping the previous one, or a snapshot merged with a fresh load), and
 * the first one wins — results are passed newest-fetch-first, so that is the
 * fresher copy.
 *
 * An item without a date sorts last rather than to the top: a feed that states
 * no time has not said its article is new, and putting it first would let a
 * missing field decide the order of the list.
 */
export function mergeNews(results: NewsFetchResult[]): NewsItem[] {
  const byId = new Map<string, NewsItem>();
  for (const result of results) {
    for (const item of result.items) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
  }
  return [...byId.values()].sort((a, b) => {
    if (a.publishedAt === null && b.publishedAt === null) return 0;
    if (a.publishedAt === null) return 1;
    if (b.publishedAt === null) return -1;
    return b.publishedAt - a.publishedAt;
  });
}

/** The sources a fetch could not read, for the line under the list. */
export function unreachableSources(
  results: NewsFetchResult[],
  sources: NewsSource[],
): NewsSource[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const out: NewsSource[] = [];
  for (const result of results) {
    if (result.error === undefined) continue;
    const source = byId.get(result.sourceId);
    // A source that still handed over something from an earlier fetch is not
    // reported as unreachable: what is on screen came from it.
    if (source && result.items.length === 0) out.push(source);
  }
  return out;
}

/** The newest moment anything in this set was actually read. */
export function newestFetch(results: NewsFetchResult[]): number | null {
  const times = results.map((r) => r.fetchedAt).filter((at) => at > 0);
  return times.length === 0 ? null : Math.max(...times);
}
