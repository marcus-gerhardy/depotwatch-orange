import { describe, expect, it } from "vitest";
import { decodeEntities, looksLikeFeed, parseFeed } from "./feedParse";

const rss = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Example Feed</title>
    <link>https://example.com/</link>
    <item>
      <title>Taproot activation, explained</title>
      <link>https://example.com/taproot</link>
      <guid isPermaLink="false">post-1</guid>
      <pubDate>Tue, 15 Sep 2026 08:30:00 +0000</pubDate>
      <description><![CDATA[<p>A short <b>teaser</b>.</p>]]></description>
      <content:encoded><![CDATA[<p>The entire article, which must never be taken over.</p>]]></content:encoded>
    </item>
    <item>
      <title>Second post &amp; friends</title>
      <link>https://example.com/second</link>
      <pubDate>Mon, 14 Sep 2026 08:30:00 +0000</pubDate>
    </item>
  </channel>
</rss>`;

const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Optech</title>
  <entry>
    <title>Newsletter #300</title>
    <link rel="replies" href="https://example.org/comments"/>
    <link rel="alternate" type="text/html" href="https://example.org/300"/>
    <id>tag:example.org,2026:/300</id>
    <published>2026-09-10T12:00:00Z</published>
    <summary>This week: a summary.</summary>
    <content type="html">The whole newsletter.</content>
  </entry>
</feed>`;

describe("parseFeed", () => {
  it("reads RSS items", () => {
    const items = parseFeed(rss, "example");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "post-1",
      sourceId: "example",
      title: "Taproot activation, explained",
      link: "https://example.com/taproot",
      excerpt: "A short teaser.",
    });
    expect(items[0].publishedAt).toBe(Date.parse("2026-09-15T08:30:00Z"));
  });

  it("never takes over the full text", () => {
    // The one rule the whole feature rests on: `content:encoded` and Atom's
    // `<content>` are the article itself, and the app shows the teaser the
    // publisher offered as a teaser or nothing at all.
    const all = [...parseFeed(rss, "x"), ...parseFeed(atom, "x")];
    for (const item of all) {
      expect(item.excerpt ?? "").not.toContain("entire article");
      expect(item.excerpt ?? "").not.toContain("whole newsletter");
    }
  });

  it("reads Atom entries and picks the alternate link", () => {
    // An Atom entry carries several <link>s; the one to send a reader to is
    // rel="alternate", never the comments feed that happens to come first.
    const items = parseFeed(atom, "optech");
    expect(items).toHaveLength(1);
    expect(items[0].link).toBe("https://example.org/300");
    expect(items[0].id).toBe("tag:example.org,2026:/300");
    expect(items[0].excerpt).toBe("This week: a summary.");
  });

  it("falls back to the link when there is no guid", () => {
    expect(parseFeed(rss, "x")[1].id).toBe("https://example.com/second");
  });

  it("decodes entities in titles", () => {
    expect(parseFeed(rss, "x")[1].title).toBe("Second post & friends");
  });

  it("drops an item whose link is not http(s)", () => {
    // A feed is somebody else's text and this value ends up in an href, so a
    // javascript: URL there would be script execution on a click.
    const hostile = `<rss><channel><item>
      <title>Click me</title>
      <link>javascript:alert(1)</link>
    </item></channel></rss>`;
    expect(parseFeed(hostile, "x")).toEqual([]);
  });

  it("keeps an item without a date, with a null date", () => {
    // "No time stated" is information; inventing today would make a two-year
    // old article the newest thing in the list.
    const undated = `<rss><channel><item>
      <title>Undated</title><link>https://example.com/u</link>
    </item></channel></rss>`;
    expect(parseFeed(undated, "x")[0].publishedAt).toBeNull();
  });

  it("drops an item without a title or without a link", () => {
    const partial = `<rss><channel>
      <item><link>https://example.com/a</link></item>
      <item><title>No link</title></item>
    </channel></rss>`;
    expect(parseFeed(partial, "x")).toEqual([]);
  });

  it("yields nothing for something that is not a feed", () => {
    // An error page, a login wall, a captcha: all of them are HTML, and none
    // of them may turn into headlines.
    expect(parseFeed("<!DOCTYPE html><html><body>Not found</body></html>", "x")).toEqual([]);
    expect(parseFeed("", "x")).toEqual([]);
  });

  it("shortens a long excerpt on a word boundary", () => {
    const long = "word ".repeat(200);
    const feed = `<rss><channel><item><title>T</title>
      <link>https://example.com/l</link><description>${long}</description>
    </item></channel></rss>`;
    const excerpt = parseFeed(feed, "x")[0].excerpt!;
    expect(excerpt.length).toBeLessThanOrEqual(241);
    expect(excerpt.endsWith("…")).toBe(true);
  });

  it("caps how many items one feed can contribute", () => {
    const many = Array.from(
      { length: 80 },
      (_, i) => `<item><title>T${i}</title><link>https://example.com/${i}</link></item>`,
    ).join("");
    expect(parseFeed(`<rss><channel>${many}</channel></rss>`, "x").length).toBe(30);
  });
});

describe("decodeEntities", () => {
  it("resolves named, decimal and hex references", () => {
    expect(decodeEntities("a &amp; b &#66; &#x43;")).toBe("a & b B C");
  });

  it("leaves an unknown entity alone rather than eating it", () => {
    expect(decodeEntities("100 &euro;")).toBe("100 &euro;");
  });
});

describe("looksLikeFeed", () => {
  it("accepts RSS and Atom, rejects a web page", () => {
    expect(looksLikeFeed('<?xml version="1.0"?><rss version="2.0">')).toBe(true);
    expect(looksLikeFeed('<feed xmlns="http://www.w3.org/2005/Atom">')).toBe(true);
    expect(looksLikeFeed("<!DOCTYPE html><html>")).toBe(false);
  });
});
