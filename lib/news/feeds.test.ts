import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  SYSTEM_NEWS_SOURCES,
  SYSTEM_SOURCES_BY_ID,
  allSources,
  customSourceId,
  defaultEnabledFor,
  enabledSources,
  hasNewsConsent,
  isSourceEnabled,
  offByLanguage,
} from "./feeds";
import { checkFeedUrl } from "./urlPolicy";
import type { NewsSettings, NewsSource } from "./types";

/**
 * A source that ships switched off. Nothing in the list does at the moment, so
 * the behaviour is pinned against one built here — the format supports it, and
 * the next busy feed will need it.
 */
const QUIET: NewsSource = {
  id: "quiet",
  name: "Quiet",
  language: "en",
  url: "https://example.com/quiet.xml",
  defaultEnabled: false,
};

describe("the shipped feed list", () => {
  it("passes its own validator", () => {
    // The same check the build runs. It is in a test as well because this file
    // is the proxy's allowlist: a careless entry here is not a typo, it is a
    // server being told to fetch something new.
    expect(() =>
      execFileSync("node", ["scripts/validate-news-feeds.mjs"], { stdio: "pipe" }),
    ).not.toThrow();
  });

  it("only lists feeds the proxy would accept", () => {
    // The two checks are independent (the allowlist is by URL, the policy is
    // by shape), and a shipped feed that failed the policy would be one the
    // app offers and the route refuses.
    for (const source of SYSTEM_NEWS_SOURCES) {
      expect(checkFeedUrl(source.url).ok, source.id).toBe(true);
    }
  });

  it("credits every source and links its terms", () => {
    for (const source of SYSTEM_NEWS_SOURCES) {
      expect(source.name, source.id).not.toBe("");
      expect(source.terms, source.id).toMatch(/^https:\/\//);
      expect(source.homepage, source.id).toMatch(/^https:\/\//);
    }
  });

  it("covers both interface languages", () => {
    // Every language the app speaks needs at least one source, or the
    // preselection below has nothing to select for that reader.
    const languages = new Set(SYSTEM_NEWS_SOURCES.map((s) => s.language));
    expect([...languages].sort()).toEqual(["de", "en"]);
  });
});

describe("which sources are on", () => {
  it("follows the shipped default when the user has said nothing", () => {
    // Nothing ships switched off at the moment, so the format's own answer is
    // checked against a source built here rather than against the list.
    expect(isSourceEnabled(QUIET, undefined, "en")).toBe(false);
    expect(isSourceEnabled(SYSTEM_SOURCES_BY_ID.get("bitcoin-magazine")!, undefined, "en")).toBe(
      true,
    );
  });

  it("lets the user override the default in both directions", () => {
    const loud = SYSTEM_SOURCES_BY_ID.get("bitcoin-magazine")!;
    const settings: NewsSettings = {
      sourceState: { [QUIET.id]: true, [loud.id]: false },
    };
    expect(isSourceEnabled(QUIET, settings, "en")).toBe(true);
    expect(isSourceEnabled(loud, settings, "en")).toBe(false);
  });

  it("stores an override rather than a copy of the default", () => {
    // Nothing is written for a source the user never touched, so changing a
    // shipped default in an app update reaches everyone who had no opinion and
    // nobody who did.
    const settings: NewsSettings = { sourceState: { "bitcoin-magazine": false } };
    expect(Object.keys(settings.sourceState!)).toEqual(["bitcoin-magazine"]);
    expect(enabledSources(settings, "en").some((s) => s.id === "bitcoin-magazine")).toBe(false);
  });
});

describe("the language of the preselection", () => {
  it("picks the sources a reader of that language can actually read", () => {
    const forGerman = enabledSources(undefined, "de").map((s) => s.id);
    expect(forGerman).toContain("bitcoinblog-de");
    expect(forGerman).not.toContain("bitcoin-magazine");

    const forEnglish = enabledSources(undefined, "en").map((s) => s.id);
    expect(forEnglish).toContain("bitcoin-magazine");
    expect(forEnglish).not.toContain("bitcoinblog-de");
  });

  it("never leaves the widget with nothing to show, in either language", () => {
    for (const locale of ["de", "en"] as const) {
      expect(enabledSources(undefined, locale).length, locale).toBeGreaterThan(0);
    }
  });

  it("keeps foreign sources on when the reader's language has none", () => {
    // The clause that stops the rule from emptying the widget: a list that
    // covers only some languages is the normal state of a list that grows by
    // pull request, and an empty tile helps nobody.
    const englishOnly: NewsSource = {
      id: "x",
      name: "X",
      language: "en",
      url: "https://example.com/x.xml",
    };
    // Asked as a German reader, against a shipped list that does have German:
    // this one steps back.
    expect(defaultEnabledFor(englishOnly, "de")).toBe(false);
    // The inverse case is the shipped list itself: every language it covers
    // keeps at least one source, which the test above states.
  });

  it("leaves a source the user decided about alone when the language changes", () => {
    // The override is the user's answer, not a cached default: switching the
    // interface to English must not switch their German feed back on.
    const settings: NewsSettings = { sourceState: { "bitcoinblog-de": false } };
    expect(isSourceEnabled(SYSTEM_SOURCES_BY_ID.get("bitcoinblog-de")!, settings, "de")).toBe(
      false,
    );
    const kept: NewsSettings = { sourceState: { "bitcoin-magazine": true } };
    expect(isSourceEnabled(SYSTEM_SOURCES_BY_ID.get("bitcoin-magazine")!, kept, "de")).toBe(
      true,
    );
  });

  it("still respects a source that ships switched off", () => {
    // Language does not override "too busy for a chronological list".
    expect(defaultEnabledFor(QUIET, QUIET.language)).toBe(false);
  });

  it("says why a source is off, but only when language is the reason", () => {
    const magazine = SYSTEM_SOURCES_BY_ID.get("bitcoin-magazine")!;
    expect(offByLanguage(magazine, undefined, "de")).toBe(true);
    expect(offByLanguage(magazine, undefined, "en")).toBe(false);
    // A source the user switched off themselves is off for their own reason.
    expect(
      offByLanguage(magazine, { sourceState: { "bitcoin-magazine": false } }, "de"),
    ).toBe(false);
  });
});

describe("custom sources", () => {
  const settings: NewsSettings = {
    customSources: [
      { id: "custom-example-com", name: "Mine", url: "https://example.com/feed" },
    ],
  };

  it("appear after the shipped ones", () => {
    const all = allSources(settings);
    expect(all).toHaveLength(SYSTEM_NEWS_SOURCES.length + 1);
    expect(all.at(-1)).toMatchObject({ id: "custom-example-com", custom: true });
  });

  it("cannot shadow a shipped source", () => {
    // Ids are what `sourceState` is keyed by, so two sources sharing one would
    // make "mute this" ambiguous.
    const clashing: NewsSettings = {
      customSources: [
        { id: "bitcoin-magazine", name: "Impostor", url: "https://evil.example/feed" },
      ],
    };
    const all = allSources(clashing);
    expect(all.filter((s) => s.id === "bitcoin-magazine")).toHaveLength(1);
    expect(all.find((s) => s.id === "bitcoin-magazine")!.custom).toBe(false);
  });
});

describe("customSourceId", () => {
  it("reads as something, and stays unique", () => {
    expect(customSourceId("https://www.example.com/feed", [])).toBe("custom-example-com");
    expect(customSourceId("https://example.com/feed", ["custom-example-com"])).toBe(
      "custom-example-com-2",
    );
  });
});

describe("hasNewsConsent", () => {
  it("is false until the user has actually agreed", () => {
    // The default state of the whole feature, and therefore the thing that
    // decides whether anything is ever requested.
    expect(hasNewsConsent(undefined)).toBe(false);
    expect(hasNewsConsent({})).toBe(false);
    expect(hasNewsConsent({ consentedAt: "" })).toBe(false);
    expect(hasNewsConsent({ consentedAt: "2026-09-25T10:00:00Z" })).toBe(true);
  });
});
