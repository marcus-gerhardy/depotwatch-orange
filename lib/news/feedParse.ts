// RSS and Atom, reduced to the four fields the app is allowed to show.
//
// Written without `DOMParser` on purpose: the same parse has to run in the
// proxy route (Node, where there is no DOM) and in the browser, and two
// implementations of "what does this feed say" would be two chances to
// disagree. It is also why this is a pure function over a string — a parser is
// exactly the kind of code that is easy to get subtly wrong and cheap to test.
//
// What it deliberately does **not** read: `<content:encoded>` and Atom's
// `<content>`. That is the full article, and taking it over is the one thing
// the feature must never do (docs/news.md). The summary a feed offers as a
// summary is the excerpt; nothing else is.

import type { NewsItem } from "./types";

/** Nobody reads the 500th headline, and a runaway feed should not cost memory. */
const MAX_ITEMS = 30;
/** An excerpt is a teaser. Past this it is a copy of somebody's article. */
const MAX_EXCERPT = 240;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Resolve XML/HTML entities. Unknown ones are left alone rather than eaten. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * Strip CDATA wrappers, markup and entities; collapse whitespace.
 *
 * Tags become a space rather than nothing, because `<p>one</p><p>two</p>` has
 * to read as two words and not as one. The cost is a space in front of the
 * punctuation that followed an inline tag ("a <b>teaser</b>." → "a teaser ."),
 * so that is taken out again afterwards.
 */
function plainText(raw: string): string {
  const withoutCdata = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  const withoutTags = withoutCdata.replace(/<[^>]*>/g, " ");
  return decodeEntities(withoutTags)
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?%)\]}»”’])/g, "$1")
    .replace(/([(\[{«“‘])\s+/g, "$1")
    .trim();
}

/**
 * Text of the first `<tag>` (any namespace prefix) inside `block`.
 *
 * Namespace-tolerant because feeds are: the same field is `<pubDate>` in one
 * and `<dc:date>` in another, and a parser that insisted on one spelling would
 * report half the feeds as dateless.
 */
function tagText(block: string, ...names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(
      `<(?:[a-z0-9-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[a-z0-9-]+:)?${name}\\s*>`,
      "i",
    );
    const m = re.exec(block);
    if (m) {
      const text = plainText(m[1]);
      if (text !== "") return text;
    }
  }
  return null;
}

/**
 * The entry's link to the original.
 *
 * RSS writes it as text in `<link>`; Atom writes it as an attribute on a
 * self-closing `<link href="…" rel="…">`, of which there can be several — the
 * one to show is `rel="alternate"` (or none at all), never `rel="replies"` or
 * an enclosure.
 */
function entryLink(block: string): string | null {
  for (const m of block.matchAll(/<(?:[a-z0-9-]+:)?link\b([^>]*)\/?>/gi)) {
    const attrs = m[1];
    const rel = /\brel\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
    if (rel !== undefined && rel !== "alternate") continue;
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (href) return decodeEntities(href).trim();
  }
  const text = tagText(block, "link");
  if (text) return text;
  // Some feeds only carry the article URL as the guid.
  const guid = tagText(block, "guid");
  return guid && /^https?:\/\//i.test(guid) ? guid : null;
}

/**
 * Only http(s) links are kept.
 *
 * A feed is somebody else's text, and this value ends up in an `href`. A
 * `javascript:` URL there would be script execution on a click; dropping the
 * item is the only safe reading of it.
 */
function safeLink(raw: string | null): string | null {
  if (raw === null) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** RFC-822 (RSS) and ISO-8601 (Atom) both parse; anything else is "no date". */
function parseDate(raw: string | null): number | null {
  if (raw === null) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function shorten(text: string | null): string | undefined {
  if (text === null || text === "") return undefined;
  if (text.length <= MAX_EXCERPT) return text;
  // Cut on a word boundary so the excerpt does not end mid-word.
  const cut = text.slice(0, MAX_EXCERPT);
  const space = cut.lastIndexOf(" ");
  return `${(space > MAX_EXCERPT * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** The `<item>` (RSS) or `<entry>` (Atom) blocks of a document. */
function entryBlocks(xml: string): string[] {
  const items = [
    ...xml.matchAll(/<(?:[a-z0-9-]+:)?item(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-z0-9-]+:)?item\s*>/gi),
  ];
  if (items.length > 0) return items.map((m) => m[1]);
  return [
    ...xml.matchAll(/<(?:[a-z0-9-]+:)?entry(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-z0-9-]+:)?entry\s*>/gi),
  ].map((m) => m[1]);
}

/** Does this look like a feed at all, rather than an error page? */
export function looksLikeFeed(xml: string): boolean {
  return /<(?:[a-z0-9-]+:)?(rss|feed|rdf:RDF)\b/i.test(xml.slice(0, 2000));
}

/**
 * Parse a feed document into items, newest entries kept in file order.
 *
 * Tolerant by design: an entry without a usable link is dropped (there is
 * nothing to send the reader to), an entry without a date is kept with a null
 * one (the UI says "no date" rather than inventing today), and a document that
 * is not a feed yields nothing rather than throwing.
 */
export function parseFeed(xml: string, sourceId: string): NewsItem[] {
  if (!looksLikeFeed(xml)) return [];

  const out: NewsItem[] = [];
  for (const block of entryBlocks(xml)) {
    if (out.length >= MAX_ITEMS) break;

    const link = safeLink(entryLink(block));
    const title = tagText(block, "title");
    if (link === null || title === null) continue;

    const guid = tagText(block, "guid", "id");
    out.push({
      id: guid ?? link,
      sourceId,
      title,
      link,
      publishedAt: parseDate(
        tagText(block, "pubDate", "published", "date", "updated", "created"),
      ),
      // `description`/`summary` only: `content:encoded` is the whole article.
      excerpt: shorten(tagText(block, "description", "summary", "subtitle")),
    });
  }
  return out;
}
