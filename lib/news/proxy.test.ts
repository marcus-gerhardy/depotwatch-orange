import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cacheTtlFrom,
  clearNewsProxyCache,
  fetchFeedCached,
  handleNewsRequest,
  isAllowedFeed,
  type ProxyDeps,
} from "./proxy";
import { NEWS_CACHE_TTL_MS, newsRequestPath } from "./protocol";
import { SYSTEM_NEWS_SOURCES } from "./feeds";

const ALLOWED = SYSTEM_NEWS_SOURCES[0].url;

const FEED = `<?xml version="1.0"?><rss version="2.0"><channel>
  <item><title>One</title><link>https://example.com/1</link>
  <pubDate>Tue, 15 Sep 2026 08:30:00 +0000</pubDate></item>
</channel></rss>`;

function feedResponse(body = FEED, init: ResponseInit = {}) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/xml", ...(init.headers ?? {}) },
    ...init,
  });
}

/** A clock that only moves when a test says so. */
function deps(fetchImpl: ProxyDeps["fetch"], clock = { now: 1_000_000 }) {
  return { fetch: fetchImpl, now: () => clock.now } satisfies ProxyDeps;
}

beforeEach(() => {
  clearNewsProxyCache();
});

describe("isAllowedFeed", () => {
  it("accepts every shipped feed", () => {
    for (const source of SYSTEM_NEWS_SOURCES) {
      expect(isAllowedFeed(source.url), source.id).toBe(true);
    }
  });

  it("accepts a public feed the user could have added", () => {
    expect(isAllowedFeed("https://example.com/feed.xml")).toBe(true);
  });

  it("refuses an address inside the network the server runs in", () => {
    expect(isAllowedFeed("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedFeed("http://localhost:80/")).toBe(false);
  });
});

describe("handleNewsRequest", () => {
  it("fetches an allowed feed and returns its items", async () => {
    const fetchMock = vi.fn(async () => feedResponse());
    const url = new URL(`https://app.example${newsRequestPath([ALLOWED])}`);

    const { results } = await handleNewsRequest(url, deps(fetchMock));

    expect(results).toHaveLength(1);
    expect(results[0].feed).toBe(ALLOWED);
    expect(results[0].error).toBeUndefined();
    expect(results[0].items[0].title).toBe("One");
  });

  it("refuses a URL that is not allowed, without fetching it", async () => {
    // The refusal has to happen before the request, not after: a route that
    // fetches first and judges later has already made the request that the
    // allowlist exists to prevent.
    const fetchMock = vi.fn(async () => feedResponse());
    const url = new URL(
      `https://app.example/api/news?feed=${encodeURIComponent("http://192.168.0.1/feed")}`,
    );

    const { results } = await handleNewsRequest(url, deps(fetchMock));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(results[0].error).toBe("notAllowed");
    expect(results[0].items).toEqual([]);
  });

  it("caps how many feeds one request may ask for", async () => {
    const fetchMock = vi.fn(async () => feedResponse());
    const many = Array.from({ length: 40 }, (_, i) => `https://example.com/feed-${i}.xml`);
    const url = new URL(
      `https://app.example/api/news?${many.map((f) => `feed=${encodeURIComponent(f)}`).join("&")}`,
    );

    const { results } = await handleNewsRequest(url, deps(fetchMock));

    expect(results).toHaveLength(12);
    expect(fetchMock).toHaveBeenCalledTimes(12);
  });

  it("answers under the URL it was asked with", async () => {
    // The client matches results to sources by this string, so normalising
    // must not change what comes back.
    const asked = "https://example.com/feed.xml#section";
    const url = new URL(
      `https://app.example/api/news?feed=${encodeURIComponent(asked)}`,
    );
    const { results } = await handleNewsRequest(url, deps(async () => feedResponse()));
    expect(results[0].feed).toBe(asked);
  });

  it("lets one unreachable feed stand next to a working one", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("broken")
        ? Promise.reject(new Error("ECONNREFUSED"))
        : feedResponse(),
    );
    const url = new URL(
      `https://app.example${newsRequestPath([ALLOWED, "https://example.com/broken.xml"])}`,
    );

    const { results } = await handleNewsRequest(url, deps(fetchMock as ProxyDeps["fetch"]));

    expect(results[0].error).toBeUndefined();
    expect(results[1].error).toBe("unreachable");
  });
});

describe("fetchFeedCached", () => {
  it("serves a second call from memory rather than asking again", async () => {
    // Nine publishers should not be asked again because two people opened a
    // dashboard.
    const fetchMock = vi.fn(async () => feedResponse());
    const clock = { now: 1_000_000 };

    await fetchFeedCached(ALLOWED, deps(fetchMock, clock));
    await fetchFeedCached(ALLOWED, deps(fetchMock, clock));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("revalidates with the publisher's own validators once it is stale", async () => {
    const fetchMock = vi.fn<ProxyDeps["fetch"]>(async () =>
      feedResponse(FEED, { headers: { etag: '"abc"', "last-modified": "Tue, 15 Sep 2026 08:30:00 GMT" } }),
    );
    const clock = { now: 1_000_000 };
    await fetchFeedCached(ALLOWED, deps(fetchMock, clock));

    clock.now += NEWS_CACHE_TTL_MS + 1;
    fetchMock.mockImplementation(async () => new Response(null, { status: 304 }));
    const again = await fetchFeedCached(ALLOWED, deps(fetchMock, clock));

    const sent = fetchMock.mock.calls[1][1]!;
    expect((sent.headers as Record<string, string>)["if-none-match"]).toBe('"abc"');
    // A 304 means "unchanged": the items stay and only the timestamp moves.
    expect(again.items[0].title).toBe("One");
    expect(again.fetchedAt).toBe(clock.now);
    expect(again.error).toBeUndefined();
  });

  it("identifies itself", async () => {
    const fetchMock = vi.fn<ProxyDeps["fetch"]>(async () => feedResponse());
    await fetchFeedCached(ALLOWED, deps(fetchMock));
    const sent = fetchMock.mock.calls[0][1]!;
    const agent = (sent.headers as Record<string, string>)["user-agent"];
    expect(agent).toContain("DepotWatch");
    expect(agent).toContain("github.com");
  });

  it("keeps serving what it has when a refresh fails", async () => {
    const fetchMock = vi.fn(async () => feedResponse());
    const clock = { now: 1_000_000 };
    await fetchFeedCached(ALLOWED, deps(fetchMock, clock));

    clock.now += NEWS_CACHE_TTL_MS + 1;
    fetchMock.mockImplementation(async () => {
      throw new Error("offline");
    });
    const stale = await fetchFeedCached(ALLOWED, deps(fetchMock, clock));

    expect(stale.items[0].title).toBe("One");
    expect(stale.error).toBe("unreachable");
    // The timestamp is of the last real read, not of the failed attempt: it is
    // what the widget prints as "as of".
    expect(stale.fetchedAt).toBe(1_000_000);
  });

  it("follows a redirect, but never into a private network", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === ALLOWED) {
        return new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        });
      }
      return feedResponse();
    });

    const result = await fetchFeedCached(ALLOWED, deps(fetchMock as ProxyDeps["fetch"]));

    expect(result.error).toBe("unreachable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows a redirect to another public feed", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === ALLOWED
        ? new Response(null, { status: 301, headers: { location: "https://example.org/moved.xml" } })
        : feedResponse(),
    );

    const result = await fetchFeedCached(ALLOWED, deps(fetchMock as ProxyDeps["fetch"]));

    expect(result.error).toBeUndefined();
    expect(result.items).toHaveLength(1);
  });

  it("reports a page that is not a feed as such", async () => {
    // A login wall or a captcha answers 200 with HTML. It must not become
    // headlines, and "this is not a feed" is a different problem from "this
    // publisher is down".
    const fetchMock = vi.fn(async () => feedResponse("<!DOCTYPE html><html>nope</html>"));
    const result = await fetchFeedCached(ALLOWED, deps(fetchMock));
    expect(result.error).toBe("notAFeed");
  });

  it("refuses a body that is absurdly large", async () => {
    const fetchMock = vi.fn(async () =>
      feedResponse(FEED, { headers: { "content-length": String(50 * 1024 * 1024) } }),
    );
    const result = await fetchFeedCached(ALLOWED, deps(fetchMock));
    expect(result.error).toBe("tooLarge");
  });
});

describe("cacheTtlFrom", () => {
  const now = 1_000_000;

  it("never asks a publisher more often than the app's own interval", () => {
    // A feed saying `no-store` is talking about a browser cache. Honouring it
    // literally would mean asking again on every render, which is the
    // opposite of considerate.
    expect(cacheTtlFrom(new Headers({ "cache-control": "no-store" }), now)).toBe(
      NEWS_CACHE_TTL_MS,
    );
    expect(cacheTtlFrom(new Headers({ "cache-control": "max-age=30" }), now)).toBe(
      NEWS_CACHE_TTL_MS,
    );
  });

  it("holds a response longer when the publisher asks for it", () => {
    expect(cacheTtlFrom(new Headers({ "cache-control": "public, max-age=3600" }), now)).toBe(
      3_600_000,
    );
  });

  it("caps a very long max-age", () => {
    const ttl = cacheTtlFrom(new Headers({ "cache-control": "max-age=99999999" }), now);
    expect(ttl).toBe(6 * 60 * 60_000);
  });

  it("reads Expires when there is no Cache-Control", () => {
    const expires = new Date(now + 3_600_000).toUTCString();
    expect(cacheTtlFrom(new Headers({ expires }), now)).toBeGreaterThan(NEWS_CACHE_TTL_MS);
  });

  it("falls back to the app's interval when the feed says nothing", () => {
    expect(cacheTtlFrom(new Headers(), now)).toBe(NEWS_CACHE_TTL_MS);
  });
});
