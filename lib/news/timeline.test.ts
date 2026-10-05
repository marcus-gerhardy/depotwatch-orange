import { describe, expect, it } from "vitest";
import { mergeNews, newestFetch, unreachableSources } from "./timeline";
import type { NewsFetchResult, NewsItem, NewsSource } from "./types";

const source = (id: string): NewsSource => ({
  id,
  name: id,
  language: "en",
  url: `https://example.com/${id}.xml`,
});

const item = (
  id: string,
  sourceId: string,
  publishedAt: number | null,
): NewsItem => ({
  id,
  sourceId,
  title: id,
  link: `https://example.com/${id}`,
  publishedAt,
});

const result = (
  sourceId: string,
  items: NewsItem[],
  extra: Partial<NewsFetchResult> = {},
): NewsFetchResult => ({ sourceId, items, fetchedAt: 1000, ...extra });

describe("mergeNews", () => {
  it("is strictly chronological, newest first", () => {
    // Chronological and nothing else: a list ordered by anything but time is a
    // list that has decided what is exciting.
    const merged = mergeNews([
      result("a", [item("old", "a", 1000), item("new", "a", 3000)]),
      result("b", [item("middle", "b", 2000)]),
    ]);
    expect(merged.map((i) => i.id)).toEqual(["new", "middle", "old"]);
  });

  it("puts an item without a date last, not first", () => {
    // A feed that states no time has not said its article is new; sorting a
    // missing field to the top lets it decide the order of the list.
    const merged = mergeNews([
      result("a", [item("undated", "a", null), item("dated", "a", 1000)]),
    ]);
    expect(merged.map((i) => i.id)).toEqual(["dated", "undated"]);
  });

  it("shows an article once even when two fetches carried it", () => {
    const merged = mergeNews([
      result("a", [item("same", "a", 2000)]),
      result("a", [item("same", "a", 2000)]),
    ]);
    expect(merged).toHaveLength(1);
  });
});

describe("unreachableSources", () => {
  const sources = [source("a"), source("b")];

  it("names a source that failed and produced nothing", () => {
    const failed = unreachableSources(
      [result("a", []), result("b", [item("x", "b", 1000)])],
      sources,
    );
    expect(failed).toEqual([]);

    const withError = unreachableSources(
      [result("a", [], { error: "unreachable" }), result("b", [item("x", "b", 1000)])],
      sources,
    );
    expect(withError.map((s) => s.id)).toEqual(["a"]);
  });

  it("does not call a source unreachable while its headlines are on screen", () => {
    // A failed refresh that still served cached items is not a gap the reader
    // can see, and labelling it as one would be noise.
    const stale = unreachableSources(
      [result("a", [item("x", "a", 1000)], { error: "unreachable" })],
      sources,
    );
    expect(stale).toEqual([]);
  });
});

describe("newestFetch", () => {
  it("ignores the sources that never loaded", () => {
    expect(
      newestFetch([result("a", [], { fetchedAt: 0 }), result("b", [], { fetchedAt: 5000 })]),
    ).toBe(5000);
    expect(newestFetch([result("a", [], { fetchedAt: 0 })])).toBeNull();
  });
});
