/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isProxyKnownMissing, loadNews, resetNewsTransport } from "./client";
import { clearMarketDataCache } from "../marketData";
import type { NewsSource } from "./types";

const source: NewsSource = {
  id: "example",
  name: "Example",
  language: "en",
  url: "https://example.com/feed.xml",
};

const proxy404 = () =>
  ({ ok: false, status: 404, json: async () => ({}), text: async () => "" }) as unknown as Response;

const proxyOk = () =>
  ({
    ok: true,
    status: 200,
    json: async () => ({
      results: [
        {
          feed: source.url,
          fetchedAt: 1000,
          items: [
            {
              id: "a",
              sourceId: source.url,
              title: "A headline",
              link: "https://example.com/a",
              publishedAt: 900,
            },
          ],
        },
      ],
    }),
    text: async () => "",
  }) as unknown as Response;

beforeEach(() => {
  resetNewsTransport();
  clearMarketDataCache();
  localStorage.clear();
});

describe("the transport", () => {
  it("stamps items with the source id, not with the feed URL", async () => {
    // The route knows feeds; the app knows sources. Without this step a muted
    // source and its headlines would be keyed differently.
    vi.stubGlobal("fetch", vi.fn(async () => proxyOk()));
    const [result] = await loadNews([source]);
    expect(result.items[0].sourceId).toBe("example");
  });

  it("stops asking for a proxy that answered 404", async () => {
    // A static deployment has none and never will, so asking once per refresh
    // cycle forever would be a wasted request per cycle.
    const fetchMock = vi.fn<typeof fetch>(async () => proxy404());
    vi.stubGlobal("fetch", fetchMock);

    await loadNews([source]);
    expect(isProxyKnownMissing()).toBe(true);
    const afterFirst = fetchMock.mock.calls.length;

    clearMarketDataCache();
    await loadNews([source]);
    // The second run goes straight to the feed: one call, not two.
    const added = fetchMock.mock.calls.slice(afterFirst).map(([u]) => String(u));
    expect(added.some((u) => u.includes("/api/news"))).toBe(false);
  });

  it("asks again when the user presses refresh", async () => {
    // A deployment that gains a proxy, or a dev server restarted with one,
    // should recover on a click rather than on a page reload.
    const fetchMock = vi.fn<typeof fetch>(async () => proxy404());
    vi.stubGlobal("fetch", fetchMock);
    await loadNews([source]);
    expect(isProxyKnownMissing()).toBe(true);

    fetchMock.mockImplementation(async () => proxyOk());
    const [result] = await loadNews([source], true);

    expect(isProxyKnownMissing()).toBe(false);
    expect(result.items).toHaveLength(1);
  });

  it("reports a source it could not read rather than throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("CORS");
      }),
    );
    const [result] = await loadNews([source]);
    expect(result.items).toEqual([]);
    expect(result.error).toBeTruthy();
  });
});
