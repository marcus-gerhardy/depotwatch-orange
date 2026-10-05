import { describe, expect, it } from "vitest";
import { checkFeedUrl, isAcceptableFeedUrl } from "./urlPolicy";

/** The shape of the answer, kept short for the table below. */
const problem = (url: string) => {
  const result = checkFeedUrl(url);
  return result.ok ? null : result.problem;
};

describe("checkFeedUrl", () => {
  it("accepts an ordinary feed and normalises it", () => {
    const result = checkFeedUrl("  https://example.com/feed.xml#top  ");
    expect(result).toEqual({ ok: true, url: "https://example.com/feed.xml" });
  });

  it("accepts plain http as well as https", () => {
    expect(isAcceptableFeedUrl("http://example.com/rss")).toBe(true);
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["not a url", "notAUrl"],
    ["file:///etc/passwd", "scheme"],
    ["ftp://example.com/feed", "scheme"],
    ["javascript:alert(1)", "scheme"],
    ["https://user:pw@example.com/feed", "credentials"],
    ["https://example.com:8080/feed", "port"],
    [`https://example.com/${"x".repeat(400)}`, "tooLong"],
  ])("refuses %s", (url, expected) => {
    expect(problem(url)).toBe(expected);
  });

  describe("server-side request forgery", () => {
    // This is what the module exists for: the proxy is a server that fetches a
    // URL it is handed, so an address inside the network it runs in must never
    // be one of them.
    it.each([
      "http://localhost/feed",
      "http://localhost:80/admin",
      "http://127.0.0.1/feed",
      "http://0.0.0.0/feed",
      "http://10.0.0.5/feed",
      "http://172.16.3.4/feed",
      "http://172.31.255.1/feed",
      "http://192.168.1.1/feed",
      "http://169.254.169.254/latest/meta-data/",
      "http://100.64.0.1/feed",
      "http://[::1]/feed",
      "http://[fd00::1]/feed",
      "http://[fe80::1]/feed",
      "http://[::ffff:127.0.0.1]/feed",
      "http://intranet/feed",
      "http://printer.local/feed",
      "http://vault.internal/feed",
    ])("refuses %s", (url) => {
      expect(problem(url)).toBe("privateHost");
    });

    it("still allows the public ranges next to the private ones", () => {
      // 172.15 and 172.32 are outside 172.16/12, and 11.x is not 10.x — a
      // check that blocked these would be blocking the public internet.
      for (const host of ["172.15.0.1", "172.32.0.1", "11.0.0.1", "8.8.8.8"]) {
        expect(isAcceptableFeedUrl(`https://${host}/feed`), host).toBe(true);
      }
    });
  });
});
