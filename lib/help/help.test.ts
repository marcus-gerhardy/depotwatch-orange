/** @vitest-environment jsdom */
// The help content, checked as content.
//
// Prose cannot be unit-tested, but its structure can, and the structure is
// where documentation rots: an anchor that a button points at and that no
// longer exists, a topic that only exists in German, an image without an alt
// text. Each of those is invisible until somebody hits it.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { HELP_CONTENT } from "./content";
import { helpTopicsFor, resolveTarget, searchHelp } from "./types";
import { parseInline, helpTargetOf } from "@/components/help/HelpContent";

const LOCALES = ["de", "en"] as const;
const topicsOf = (locale: (typeof LOCALES)[number]) => helpTopicsFor(HELP_CONTENT, locale);

describe("the catalogue", () => {
  it("has the same topics and anchors in both languages", () => {
    // A deep link works in one language only if it works in both.
    const shape = (locale: (typeof LOCALES)[number]) =>
      topicsOf(locale).map((t) => [t.id, t.sections.map((s) => s.id)]);
    expect(shape("en")).toEqual(shape("de"));
  });

  it("gives every section a unique anchor", () => {
    for (const locale of LOCALES) {
      const ids = topicsOf(locale).flatMap((t) => t.sections.map((s) => s.id));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("has a title, a summary and content everywhere", () => {
    for (const locale of LOCALES) {
      for (const topic of topicsOf(locale)) {
        expect(topic.title.length).toBeGreaterThan(2);
        expect(topic.summary.length).toBeGreaterThan(10);
        expect(topic.sections.length).toBeGreaterThan(0);
        for (const section of topic.sections) {
          expect(section.title.length).toBeGreaterThan(2);
          expect(section.blocks.length).toBeGreaterThan(0);
          expect(section.text.length).toBeGreaterThan(20);
        }
      }
    }
  });

  it("gives every screenshot an alt text that says something", () => {
    for (const locale of LOCALES) {
      for (const topic of topicsOf(locale)) {
        for (const section of topic.sections) {
          for (const block of section.blocks) {
            if (block.kind !== "image") continue;
            expect(block.src.startsWith("/help/screenshots/")).toBe(true);
            expect(block.alt.split(/\s+/).length).toBeGreaterThan(4);
          }
        }
      }
    }
  });

  it("covers the topics the app promises", () => {
    const ids = topicsOf("de").map((t) => t.id);
    for (const required of [
      "getting-started",
      "files",
      "backups",
      "wallets",
      "transactions",
      "csv-import",
      "transfers",
      "sales",
      "tax",
      "dashboard",
      "watchlist",
      "utxo",
      "settings",
      "milestones",
      "faq",
    ]) {
      expect(ids).toContain(required);
    }
  });

  it("says in the tax topic that it is not tax advice", () => {
    for (const locale of LOCALES) {
      const tax = topicsOf(locale).find((t) => t.id === "tax")!;
      const text = tax.sections.map((s) => s.text).join(" ").toLowerCase();
      expect(text).toMatch(locale === "de" ? /steuerberatung/ : /tax advice/);
    }
  });
});

describe("every anchor a help button points at exists", () => {
  it("resolves every `anchor=` used in the components", () => {
    // The one link that breaks silently: a button pointing into content that
    // was renamed or removed.
    const files = readdirSync("components", { recursive: true }) as string[];
    const used = new Set<string>();
    for (const file of files) {
      if (!file.endsWith(".tsx") || file.includes(".test.")) continue;
      const source = readFileSync(`components/${file}`, "utf8");
      for (const m of source.matchAll(/anchor="([a-z0-9-]+)"/g)) used.add(m[1]);
      for (const m of source.matchAll(/help="([a-z0-9-]+)"/g)) used.add(m[1]);
      for (const m of source.matchAll(/^\s+[a-z]+: "([a-z0-9-]+)",$/gm)) {
        if (source.includes("HELP_BY_STEP")) used.add(m[1]);
      }
    }
    expect(used.size).toBeGreaterThan(5);
    for (const anchor of used) {
      for (const locale of LOCALES) {
        expect(resolveTarget(topicsOf(locale), anchor), `${anchor} (${locale})`).not.toBeNull();
      }
    }
  });

  it("resolves every help link written inside the content", () => {
    for (const locale of LOCALES) {
      const topics = topicsOf(locale);
      for (const topic of topics) {
        for (const section of topic.sections) {
          for (const block of section.blocks) {
            const texts =
              block.kind === "ul" || block.kind === "ol"
                ? block.items
                : block.kind === "image"
                  ? []
                  : [block.text];
            for (const text of texts) {
              for (const piece of parseInline(text)) {
                if (piece.kind !== "link") continue;
                const target = helpTargetOf(piece.href);
                if (target === null) {
                  // An app page, not a help link: those are real routes.
                  expect(piece.href.startsWith("/")).toBe(true);
                  continue;
                }
                expect(resolveTarget(topics, target), `${piece.href}`).not.toBeNull();
              }
            }
          }
        }
      }
    }
  });
});

describe("search", () => {
  it("finds a section by a word from its body", () => {
    const hits = searchHelp(topicsOf("de"), "freigrenze");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].topicId).toBe("tax");
  });

  it("requires every term, so two words narrow the result", () => {
    const one = searchHelp(topicsOf("de"), "backup");
    const two = searchHelp(topicsOf("de"), "backup ordner");
    expect(two.length).toBeLessThan(one.length);
    expect(two.length).toBeGreaterThan(0);
  });

  it("ranks a title match above a passing mention", () => {
    const hits = searchHelp(topicsOf("en"), "duplicates");
    expect(hits[0].sectionId).toBe("csv-duplicates");
  });

  it("says nothing rather than everything for an empty query", () => {
    expect(searchHelp(topicsOf("de"), "")).toEqual([]);
    expect(searchHelp(topicsOf("de"), "a")).toEqual([]);
  });
});

describe("inline parsing", () => {
  it("splits bold, code and links out of a line", () => {
    expect(parseInline("plain **bold** and `code` and [a link](/hilfe/tax)")).toEqual([
      { kind: "text", text: "plain " },
      { kind: "strong", text: "bold" },
      { kind: "text", text: " and " },
      { kind: "code", text: "code" },
      { kind: "text", text: " and " },
      { kind: "link", text: "a link", href: "/hilfe/tax" },
    ]);
  });

  it("leaves prose alone", () => {
    expect(parseInline("2 * 3 and a stray ` tick")).toEqual([
      { kind: "text", text: "2 * 3 and a stray ` tick" },
    ]);
  });

  it("recognises help links in both languages, and app links as external", () => {
    expect(helpTargetOf("/hilfe/tax")).toBe("tax");
    expect(helpTargetOf("/help/tax#tax-fifo")).toBe("tax-fifo");
    expect(helpTargetOf("/so-funktionierts")).toBeNull();
  });
});
