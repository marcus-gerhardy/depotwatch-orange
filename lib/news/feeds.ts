// The feed list: what ships, what the user added, and which of it is on.
//
// The shipped list is `config/news-feeds/feeds.json`, imported rather than
// fetched so it is in the bundle (the app is a static export and has to work
// offline) and so the proxy route and the browser read exactly the same list.
// Adding a source is an entry in that file and nothing else; see its README.
//
// The same list is the route's **allowlist** (`SYSTEM_FEED_URLS`). That is the
// reason it is validated in the build (`npm run feeds:validate`) rather than
// trusted: it decides what a server is willing to fetch.

import feedsFile from "@/config/news-feeds/feeds.json";
import type { Locale } from "@/lib/types";
import type { CustomNewsSource, NewsSettings, NewsSource } from "./types";

/** The sources shipped with the app, in the order the file lists them. */
export const SYSTEM_NEWS_SOURCES: NewsSource[] = (feedsFile.sources as NewsSource[]).map(
  (source) => ({ ...source, custom: false }),
);

/** Feed URLs the proxy route accepts without further questions. */
export const SYSTEM_FEED_URLS: ReadonlySet<string> = new Set(
  SYSTEM_NEWS_SOURCES.map((s) => s.url),
);

export const SYSTEM_SOURCES_BY_ID = new Map(SYSTEM_NEWS_SOURCES.map((s) => [s.id, s]));

/** A user's own feed as a source. */
function asSource(custom: CustomNewsSource): NewsSource {
  return {
    id: custom.id,
    name: custom.name,
    language: custom.language ?? "en",
    url: custom.url,
    custom: true,
  };
}

/**
 * Every source the user could see: the shipped ones, then their own.
 *
 * A custom source whose id collides with a shipped one is dropped rather than
 * shadowing it — ids are what `sourceState` is keyed by, and two sources
 * sharing one would make "mute this" ambiguous.
 */
export function allSources(settings: NewsSettings | undefined): NewsSource[] {
  const seen = new Set(SYSTEM_SOURCES_BY_ID.keys());
  const custom: NewsSource[] = [];
  for (const entry of settings?.customSources ?? []) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    custom.push(asSource(entry));
  }
  return [...SYSTEM_NEWS_SOURCES, ...custom];
}

/**
 * Is this source on by default for somebody reading in `locale`?
 *
 * Headlines one cannot read are not news, so the app's language decides the
 * shipped selection: a source in another language is off before the user has
 * said anything.
 *
 * With one exception, and it is the one that keeps the rule from being
 * useless: if the shipped list has **nothing** in the reader's language, the
 * foreign sources stay on. An empty widget helps nobody, and a list that
 * covers only some languages is the normal state of a list that grows by pull
 * request.
 *
 * The question is asked of the *shipped* list only. A feed somebody added
 * themselves is always on: they added it on purpose, in whatever language they
 * wanted it.
 */
export function defaultEnabledFor(source: NewsSource, locale: Locale): boolean {
  if (source.defaultEnabled === false) return false;
  if (source.custom) return true;
  if (source.language === locale) return true;
  return !SYSTEM_NEWS_SOURCES.some(
    (other) => other.language === locale && other.defaultEnabled !== false,
  );
}

/**
 * Is this source on?
 *
 * The stored state is an override of the shipped default, not a copy of it: a
 * source the user never touched has no entry. That is what lets the default
 * follow the app's language — switch the interface to English and the German
 * news sites step back, while every source somebody actually decided about
 * keeps the answer they gave it. It is also why changing a shipped
 * `defaultEnabled` in an app update reaches everyone who never had an opinion,
 * and nobody who did.
 */
export function isSourceEnabled(
  source: NewsSource,
  settings: NewsSettings | undefined,
  locale: Locale,
): boolean {
  const override = settings?.sourceState?.[source.id];
  if (override !== undefined) return override;
  return defaultEnabledFor(source, locale);
}

/** The sources a fetch would actually ask, in list order. */
export function enabledSources(
  settings: NewsSettings | undefined,
  locale: Locale,
): NewsSource[] {
  return allSources(settings).filter((s) => isSourceEnabled(s, settings, locale));
}

/**
 * Is this source off only because it is in another language?
 *
 * For the settings list, which says so rather than leaving a reader to wonder
 * why half the list is grey.
 */
export function offByLanguage(
  source: NewsSource,
  settings: NewsSettings | undefined,
  locale: Locale,
): boolean {
  return (
    settings?.sourceState?.[source.id] === undefined &&
    source.defaultEnabled !== false &&
    !source.custom &&
    source.language !== locale &&
    !defaultEnabledFor(source, locale)
  );
}

/** Has the user agreed that this may contact external sources at all (docs/news.md)? */
export function hasNewsConsent(settings: NewsSettings | undefined): boolean {
  return typeof settings?.consentedAt === "string" && settings.consentedAt !== "";
}

/**
 * An id for a feed the user adds: derived from its host, made unique against
 * what already exists. Derived rather than random so it reads as something in
 * the settings and in the file, which is where somebody will eventually see it.
 */
export function customSourceId(url: string, taken: Iterable<string>): string {
  let base = "feed";
  try {
    base = new URL(url).hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-");
  } catch {
    // An unparseable URL never gets this far (urlPolicy runs first), but an id
    // generator is not the place to throw.
  }
  base = `custom-${base.toLowerCase().replace(/^-+|-+$/g, "") || "feed"}`;
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}
